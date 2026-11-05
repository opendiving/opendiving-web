"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { DiveSiteLookupItem } from "@/lib/api/dive-sites";
import { GeocodeResult } from "@/lib/api/geocoding";
import { geocodeResultToLocation } from "@/lib/locations";
import {
  formatCoordinateForForm,
  parseCoordinatePair,
  parseFormPosition,
} from "@/lib/validations/coordinates";
import type { LocationFormValue } from "@/lib/validations/location";
import { useGeocodedLocation } from "@/hooks/useGeocodedLocation";
import { MapField } from "@/components/map/map-field";
import { CommonsSiteOffer } from "@/components/sites/commons-site-offer";
import { PlaceSearch, PlacePick } from "@/components/sites/place-search";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Position = { latitude: string; longitude: string };

/** What "Use location" hands back to the site form. */
export interface SearchedLocation extends Position {
  location: LocationFormValue | null;
  // Who to credit for the location's name, while it still names the position.
  credit?: string;
}

interface LocationSearchDialogProps extends Partial<Position> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The site form's Location when the dialog was opened.
  location?: LocationFormValue | null;
  // Only a new site is offered a Commons record in its place: a site being
  // edited stays what it is, so its search lists places alone.
  offerCommonsSites: boolean;
  onTakeCommonsSite: (uuid: string) => void;
  busy?: boolean;
  onUse: (picked: SearchedLocation) => void;
}

/**
 * Finds where a dive site is - by a dive site or place's name, by coordinates,
 * or on the map - without touching the site form until "Use location".
 */
export function LocationSearchDialog({
  open,
  onOpenChange,
  ...props
}: LocationSearchDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={panelRef}
        // With a position, the dialog opens on the name looked up for it, and
        // focusing Location would open its menu over the coordinates; focus
        // stays on the dialog itself, one Tab from the field.
        initialFocus={
          parseFormPosition(props.latitude, props.longitude)
            ? panelRef
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>Search location</DialogTitle>
        </DialogHeader>
        {/* Mounted with the content, so every opening starts from what the site
            form holds now rather than from what the last one left behind. */}
        <LocationSearch {...props} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function LocationSearch({
  latitude: initialLatitude = "",
  longitude: initialLongitude = "",
  location: initialLocation = null,
  offerCommonsSites,
  onTakeCommonsSite,
  busy,
  onUse,
  onClose,
}: Omit<LocationSearchDialogProps, "open" | "onOpenChange"> & {
  onClose: () => void;
}) {
  const coordinatesId = useId();
  const [latitude, setLatitude] = useState(initialLatitude);
  const [longitude, setLongitude] = useState(initialLongitude);
  const [location, setLocation] = useState(initialLocation);
  const [offer, setOffer] = useState<DiveSiteLookupItem | null>(null);

  const geocoded = useGeocodedLocation({
    open: true,
    latitude,
    longitude,
    location,
    onUseLocation: setLocation,
  });

  const position = parseFormPosition(latitude, longitude);
  // Both or neither, as the site form will insist on.
  const usable = position !== null || (!latitude.trim() && !longitude.trim());

  const setPosition = (next: Position) => {
    setLatitude(next.latitude);
    setLongitude(next.longitude);
  };

  // A position that arrived without a name: dropped on the map, or pasted into
  // the coordinates. The geocoder is asked what is there.
  const placePosition = (next: Position) => {
    setPosition(next);
    geocoded.lookup(next);
  };

  // A site that already has a position is opened as though the diver had just
  // placed its pin, so Location says what is there now. One without a position
  // has nothing to look up, and its Location is searched for instead - see
  // `initialQuery` below.
  //
  // A plain mount effect rather than `useEffectOnChange`, and after the hook:
  // the hook's own reset runs again wherever effects are re-run - Strict Mode,
  // or the route being shown again - and it discards any lookup in the air, so
  // this one has to be re-asked after it every time.
  const initialPosition = parseFormPosition(initialLatitude, initialLongitude);
  useEffect(() => {
    if (initialPosition) {
      geocoded.lookup({
        latitude: initialLatitude,
        longitude: initialLongitude,
      });
    }
    // Once per opening: what the site form held when it opened the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A forward search answered about the place itself, so the whole place goes
  // into Location, centre and box included; the pin lands on its centre only
  // because there is nothing better to put it on yet.
  const placeResult = (result: GeocodeResult) => {
    const next = {
      latitude: formatCoordinateForForm(result.latitude),
      longitude: formatCoordinateForForm(result.longitude),
    };
    setPosition(next);
    geocoded.adopt(next, {
      location: geocodeResultToLocation(result),
      attribution: result.attribution,
    });
  };

  // A Commons row fills nothing: the site it offers is that record, used as it
  // stands, never a copy of it in the form.
  const placePick = (pick: PlacePick) => {
    if (pick.kind === "commons") {
      setOffer(pick.site);
    } else {
      setOffer(null);
      placeResult(pick.result);
    }
  };

  // A pasted "27.8506, 34.3136" fills both fields and places the pin, as it
  // does in the site form.
  const handleCoordinatePaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    const pair = parseCoordinatePair(event.clipboardData.getData("text"));
    if (!pair) return;
    event.preventDefault();
    placePosition(pair);
  };

  const use = () => {
    onUse({
      latitude: latitude.trim(),
      longitude: longitude.trim(),
      location,
      credit: geocoded.credit,
    });
    onClose();
  };

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <PlaceSearch
            value={location}
            onPick={placePick}
            onTypeName={(name) => setLocation(name ? { name } : null)}
            position={position}
            listCommonsSites={offerCommonsSites}
            initialQuery={initialPosition ? undefined : initialLocation?.name}
          />
          <CommonsSiteOffer
            site={offer}
            disabled={busy}
            onTake={onTakeCommonsSite}
          />
        </div>

        {/* No `inputMode="decimal"`, for the site form's reason: iOS's decimal
            keypad has no minus key. */}
        <div
          role="group"
          aria-labelledby={`${coordinatesId}-hint`}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div className="space-y-2">
            <Label htmlFor={`${coordinatesId}-latitude`}>Latitude</Label>
            <Input
              id={`${coordinatesId}-latitude`}
              placeholder="e.g. 27.8506"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              onPaste={handleCoordinatePaste}
              aria-invalid={!usable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${coordinatesId}-longitude`}>Longitude</Label>
            <Input
              id={`${coordinatesId}-longitude`}
              placeholder="e.g. 34.3136"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              onPaste={handleCoordinatePaste}
              aria-invalid={!usable}
            />
          </div>
        </div>
        <p
          id={`${coordinatesId}-hint`}
          className={
            usable
              ? "-mt-2 text-sm text-muted-foreground"
              : "-mt-2 text-sm text-destructive"
          }
        >
          {usable
            ? "Coordinates of the site, or place it on the map below."
            : "Enter both a latitude and a longitude in decimal degrees, or neither."}
        </p>

        <MapField
          subject="the dive site"
          latitude={latitude}
          longitude={longitude}
          onPick={placePosition}
          credit={geocoded.credit}
          announcement={geocoded.announcement}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={!usable || busy} onClick={use}>
          <MapPin className="mr-2 h-4 w-4" />
          Use location
        </Button>
      </DialogFooter>
    </>
  );
}
