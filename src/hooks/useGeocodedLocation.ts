"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { geocodingAPI, GeocodeResult } from "@/lib/api/geocoding";

// A whole position, as the form holds it.
export interface GeocodedPosition {
  latitude: string;
  longitude: string;
}

export interface UseGeocodedLocationOptions {
  // Whether the dialog this belongs to is open, so a reopen starts clean - see
  // the reset below.
  open: boolean;
  // The live form values, as strings.
  latitude?: string;
  longitude?: string;
  location?: string;
  onUseLocation: (location: string) => void;
}

export interface GeocodedLocation {
  /**
   * Name the position that was just placed, and write the answer into the
   * location field a round trip later. For a position that arrived without a
   * name of its own: a pin on the map, or a pair pasted into the coordinates.
   */
  lookup: (position: GeocodedPosition) => void;
  /**
   * Take the name a searched place already came with, which needs no lookup -
   * and cancel any that is still in the air, since it is about the old pin.
   */
  adopt: (position: GeocodedPosition, result: GeocodeResult) => void;
  /** The licence credit for the name in the field, while it still describes the
   * position on screen. */
  credit?: string;
  /** What to say out loud about the field having written itself, or "". */
  announcement: string;
}

/**
 * The dive site form's Location field, in so far as the geocoder fills it in.
 *
 * Owned by `DiveSiteDialog` rather than by the map beneath it, because three
 * separate things now place a position - the map, the place search above it, and
 * a coordinate pair pasted into the latitude/longitude inputs - and only the
 * dialog can see all three. What it hands back is the state the map field
 * renders: the credit for the name currently in the field, and the announcement
 * that the field wrote itself.
 */
export function useGeocodedLocation({
  open,
  latitude,
  longitude,
  location,
  onUseLocation,
}: UseGeocodedLocationOptions): GeocodedLocation {
  // Kept with the exact field values the position was placed at, rather than
  // with the result's own coordinates: a reverse geocode answers with the
  // *matched place's* position, which for a point offshore can be a headland
  // kilometres away. Comparing against that would drop the credit the moment it
  // arrived.
  const [geocoded, setGeocoded] = useState<{
    latitude: string;
    longitude: string;
    // Null for a position the API looked up and found no name for. There is
    // nothing to credit in that case, but there is still something to announce -
    // the field was emptied, and nobody is watching it.
    result: GeocodeResult | null;
    // Composed where the event happened rather than derived here, because the
    // three ways in have three different things to say - and a searched place
    // has to name the coordinates it moved the pin to, which nothing else on
    // screen says out loud.
    announcement: string;
  } | null>(null);

  // Only the newest lookup may write the location: a diver correcting a pin
  // fires several, and they can come back out of order - Redis-cached answers
  // return far faster than ones that reach the provider.
  const requestRef = useRef(0);

  // ...and a counter only settles placement-against-placement. Editing any of
  // these three fields by hand starts no lookup and so bumps nothing, which
  // leaves a reply still in flight free to land on top of it. So the reply is
  // checked against the fields as they stand when it arrives, not as they stood
  // when it was sent. A layout effect rather than a passive one, for the same
  // reason as in `map-picker.tsx`: it is caught up inside the commit, where no
  // reply can be processed.
  const liveRef = useRef({ latitude, longitude, location });
  useLayoutEffect(() => {
    liveRef.current = { latitude, longitude, location };
  });

  // This state used to live in `DiveSiteMapField`, which unmounts with the
  // dialog's content and so was clean on every open. The dialog itself is
  // always mounted, so the reset has to be said out loud or a credit outlives
  // the site it was earned on.
  useEffect(() => {
    if (!open) return;
    // Anything still in the air was asked about the site the dialog showed last
    // time. Its guards all compare against the form's current values, which the
    // reopen has just replaced - so it would be answering about a form that no
    // longer exists.
    requestRef.current++;
    // Synchronising state to an external prop flipping, which is the case the
    // rule's own escape hatch is for - same as `useDialogApiError`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGeocoded(null);
  }, [open]);

  const lookup = (placed: GeocodedPosition) => {
    const request = ++requestRef.current;
    // What the Location field held when the position was placed. A reply is only
    // allowed to write over *this*, never over something typed since.
    const locationAtPick = location;
    setGeocoded(null);
    geocodingAPI
      .reverseGeocode(Number(placed.latitude), Number(placed.longitude))
      .then((outcome) => {
        if (request !== requestRef.current) return;
        const live = liveRef.current;
        if (
          live.latitude !== placed.latitude ||
          live.longitude !== placed.longitude
        ) {
          return;
        }
        // The position has not moved, but the diver may still have typed a
        // location while the reply was in the air - and that edit is the newer
        // intent. "Moving the pin overwrites what you typed" is the accepted
        // cost; "typing after placing the pin gets overwritten anyway" is not,
        // and it is the very thing the `unknown`-does-not-clear rule below
        // protects.
        if (live.location !== locationAtPick) return;
        // An `unknown` outcome is not an answer about the position - geocoding
        // switched off, the instance over its provider cap (one request a
        // second, counted across everybody), or the provider timing out. None of
        // those are grounds to empty a field, and clearing on them means nudging
        // a pin twice inside a second silently wipes a location the diver typed.
        if (outcome.status === "unknown") return;
        // A nameless position with an empty field is a clearing that clears
        // nothing, and the announcement below would still say it happened -
        // telling a screen reader user something was destroyed when nothing
        // was, in text nobody looking at the screen can see is wrong. Trimmed,
        // the way `isSet` in `lib/validations/dive-site.ts` treats every other
        // field here: a stray space is not something a diver typed on purpose,
        // and emptying it looks identical on screen to emptying nothing.
        if (outcome.status === "nameless" && !live.location?.trim()) return;
        // Whereas `nameless` *is* an answer: the API looked the position up and
        // there is no name there, so whatever is in the field describes where
        // the pin used to be and goes. Both branches write straight into the
        // field rather than offering a confirmation - it stays a plain text
        // input, so a diver who prefers "Blue Hole (north entry)" types over it,
        // the trade being that moving the pin afterwards writes over whatever
        // they typed, since a placement is what this is answering.
        const result = outcome.status === "named" ? outcome.result : null;
        setGeocoded({
          ...placed,
          result,
          // Said out loud because the Location field writes itself a round trip
          // after the position was placed, and nobody is looking at it when it
          // happens - least of all when what it did was empty the field.
          announcement: result
            ? `Location set to ${result.location}.`
            : "This position has no name, so the location was cleared.",
        });
        onUseLocation(result?.location ?? "");
      })
      // A failure is not an answer, so the location is left exactly as it is.
      // Geocoding is optional on the API - it can be switched off, the provider
      // can be down, and an older API has no such endpoint - and none of those
      // are grounds to throw away a name the diver may have typed themselves.
      .catch(() => {});
  };

  const adopt = (placed: GeocodedPosition, result: GeocodeResult) => {
    // No lookup to make - the search already answered - but a reply in the air
    // is about the position this one replaces, and the guards it runs would
    // pass if the diver happened to be back where they started.
    requestRef.current++;
    setGeocoded({
      ...placed,
      result,
      // Both halves, because a searched place moves the pin as well as filling
      // the field and neither is visible to a screen reader: the map announces
      // only what it placed itself, and the coordinate inputs say nothing at
      // all when they are written to.
      announcement: `Placed at ${placed.latitude}, ${placed.longitude}. Location set to ${result.location}.`,
    });
    onUseLocation(result.location);
  };

  // A position moved by hand afterwards - typed, pasted, or cleared - is no
  // longer the point that was named, so the credit for that name no longer
  // belongs on screen. Derived rather than cleared in an effect: the same
  // conclusion reached a render earlier and with no cascading re-render.
  const isStale =
    !!geocoded &&
    (geocoded.latitude !== latitude || geocoded.longitude !== longitude);
  const current = isStale ? null : geocoded;

  return {
    lookup,
    adopt,
    credit: current?.result?.attribution,
    announcement: current?.announcement ?? "",
  };
}
