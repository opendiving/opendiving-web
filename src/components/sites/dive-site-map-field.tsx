"use client";

import { useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { geocodingAPI, GeocodeResult } from "@/lib/api/geocoding";
import { LatLon } from "@/lib/map-tiles";
import {
  formatCoordinateForForm,
  parseFormPosition,
} from "@/lib/validations/dive-site";

// Still `next/dynamic` although the map is always shown: the tile grid, the
// projection maths and the gesture handling then live in their own chunk,
// fetched when this dialog opens rather than sitting in the bundle every page
// pays for. `ssr: false` because the picker measures its own element and reads
// the resolved theme - neither exists on the server.
const MapPicker = dynamic(
  () => import("./map-picker").then((module) => module.MapPicker),
  {
    ssr: false,
    loading: () => (
      <div className="h-56 w-full animate-pulse rounded-md border bg-muted sm:h-64" />
    ),
  },
);

interface DiveSiteMapFieldProps {
  // The live form values, as strings - the same ones the latitude/longitude
  // inputs are bound to.
  latitude?: string;
  longitude?: string;
  location?: string;
  onPick: (position: { latitude: string; longitude: string }) => void;
  onUseLocation: (location: string) => void;
}

/**
 * The map half of the dive site form: the lazily loaded picker, and whatever
 * the geocoder makes of the point that was placed.
 *
 * Split out of `DiveSiteDialog` because it owns two things the dialog does not
 * care about - a network call, and the place name that comes back from it - and
 * the dialog was already at the length where a reviewer starts asking.
 */
export function DiveSiteMapField({
  latitude,
  longitude,
  location,
  onPick,
  onUseLocation,
}: DiveSiteMapFieldProps) {
  // Kept with the exact field values the pin was placed at, rather than with
  // the result's own coordinates: a reverse geocode answers with the *matched
  // place's* position, which for a point offshore can be a headland kilometres
  // away. Comparing against that would drop the credit the moment it arrived.
  const [geocoded, setGeocoded] = useState<{
    latitude: string;
    longitude: string;
    // Null for a position the API looked up and found no name for. There is
    // nothing to credit in that case, but there is still something to announce -
    // the field was emptied, and nobody is watching it.
    result: GeocodeResult | null;
  } | null>(null);

  const position = parseFormPosition(latitude, longitude);

  // Only the newest lookup may write the location: a diver correcting a pin
  // fires several, and they can come back out of order - Redis-cached answers
  // return far faster than ones that reach the provider.
  const requestRef = useRef(0);

  // ...and a counter only settles pin-against-pin. Editing any of these three
  // fields by hand starts no lookup and so bumps nothing, which leaves a reply
  // still in flight free to land on top of it. So the reply is checked against
  // the fields as they stand when it arrives, not as they stood when it was
  // sent. A layout effect rather than a passive one, for the same reason as in
  // `map-picker.tsx`: it is caught up inside the commit, where no reply can be
  // processed.
  const liveRef = useRef({ latitude, longitude, location });
  useLayoutEffect(() => {
    liveRef.current = { latitude, longitude, location };
  });

  const handlePick = (picked: LatLon) => {
    const placed = {
      latitude: formatCoordinateForForm(picked.latitude),
      longitude: formatCoordinateForForm(picked.longitude),
    };
    onPick(placed);

    const request = ++requestRef.current;
    // What the Location field held when the pin went down. A reply is only
    // allowed to write over *this*, never over something typed since.
    const locationAtPick = location;
    setGeocoded(null);
    geocodingAPI
      .reverseGeocode(picked.latitude, picked.longitude)
      .then((outcome) => {
        if (request !== requestRef.current) return;
        const live = liveRef.current;
        if (
          live.latitude !== placed.latitude ||
          live.longitude !== placed.longitude
        ) {
          return;
        }
        // The pin has not moved, but the diver may still have typed a location
        // while the reply was in the air - and that edit is the newer intent.
        // "Moving the pin overwrites what you typed" is the accepted cost;
        // "typing after placing the pin gets overwritten anyway" is not, and it
        // is the very thing the `unknown`-does-not-clear rule below protects.
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
        setGeocoded({ ...placed, result });
        onUseLocation(result?.location ?? "");
      })
      // A failure is not an answer, so the location is left exactly as it is.
      // Geocoding is optional on the API - it can be switched off, the provider
      // can be down, and an older API has no such endpoint - and none of those
      // are grounds to throw away a name the diver may have typed themselves.
      .catch(() => {});
  };

  // A pin moved by hand afterwards - typed, pasted, or cleared - is no longer
  // the point that was looked up, so the credit for that lookup no longer
  // belongs on screen. Derived rather than cleared in an effect: the same
  // conclusion reached a render earlier and with no cascading re-render.
  const isStale =
    !!geocoded &&
    (geocoded.latitude !== latitude || geocoded.longitude !== longitude);

  const current = isStale ? null : geocoded;
  const credit = current?.result?.attribution;
  // Said out loud because the Location field writes itself a round trip after
  // the pin was placed, and nobody is looking at it when it happens - least of
  // all when what it did was empty the field.
  const announcement = current
    ? current.result
      ? `Location set to ${current.result.location}.`
      : "This position has no name, so the location was cleared."
    : "";

  return (
    <div className="space-y-2">
      <MapPicker
        latitude={position?.latitude ?? null}
        longitude={position?.longitude ?? null}
        onPick={handlePick}
      />

      {/* Attribution for the place name is a licence condition of the data, and
          is carried on the result itself so it survives a change of provider.
          Separate from the tile attribution drawn over the map: the same
          provider serves both today, and need not tomorrow. */}
      <p role="status" className="text-xs text-muted-foreground">
        {credit && <>Location from {credit}</>}
        <span className="sr-only">{announcement}</span>
      </p>
    </div>
  );
}
