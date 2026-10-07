"use client";

import { useEffect, useId, useState } from "react";
import { MapPin } from "lucide-react";
import {
  diveSitePlaceContext,
  DiveSiteSuggestion,
} from "@/lib/api/dive-site-catalog";
import { GeocodeResult } from "@/lib/api/geocoding";
import { geocodeResultToLocation } from "@/lib/locations";
import {
  formatCoordinateForForm,
  parseCoordinatePair,
  parseFormPosition,
} from "@/lib/validations/dive-site";
import type { LocationFormValue } from "@/lib/validations/location";
import { useGeocodedLocation } from "@/hooks/useGeocodedLocation";
import { DiveSiteMapField } from "@/components/sites/dive-site-map-field";
import { HeldSiteOffer } from "@/components/sites/held-site-offer";
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
  // The catalog dive site last picked, which also names the site and carries
  // its registry entry. Dragging the pin off it afterwards keeps it, as it
  // always has in the form; picking a place instead drops it.
  site: DiveSiteSuggestion | null;
}

interface LocationSearchDialogProps extends Partial<Position> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The site form's Location when the dialog was opened.
  location?: LocationFormValue | null;
  // Only a new site is offered the one the diver already holds for a picked
  // catalog row; an edit fills the site being edited, which may be that site.
  offerHeldSites: boolean;
  onTakeHeldSite: (uuid: string) => void;
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // With a position, the dialog opens on the name looked up for it, and
        // focusing Location would open its menu over the coordinates; focus
        // stays on the dialog itself, one Tab from the field.
        onOpenAutoFocus={(event) => {
          if (!parseFormPosition(props.latitude, props.longitude)) return;
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
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
  offerHeldSites,
  onTakeHeldSite,
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
  const [site, setSite] = useState<DiveSiteSuggestion | null>(null);
  const [offer, setOffer] = useState<DiveSiteSuggestion | null>(null);

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
    setSite(null);
    setPosition(next);
    geocoded.adopt(next, {
      location: geocodeResultToLocation(result),
      attribution: result.attribution,
    });
  };

  // Location comes off the record rather than out of a lookup: the catalog
  // already resolved `region, country` when it was built. Where it resolved to
  // neither, Location is left as it is - a site with no place context is not an
  // answer about where the site is.
  const fillFromCatalogSite = (picked: DiveSiteSuggestion) => {
    setOffer(null);
    const next = {
      latitude: formatCoordinateForForm(picked.latitude),
      longitude: formatCoordinateForForm(picked.longitude),
    };
    setSite(picked);
    setPosition(next);
    const place = diveSitePlaceContext(picked);
    geocoded.adopt(
      next,
      place
        ? { location: { name: place }, attribution: picked.attribution }
        : null,
    );
  };

  // A row the diver already has a site for, picked while creating one, offers
  // that site first and fills nothing until they answer.
  const placePick = (pick: PlacePick) => {
    if (pick.kind === "geocode") {
      setOffer(null);
      placeResult(pick.result);
    } else if (offerHeldSites && pick.site.held_site) {
      setOffer(pick.site);
    } else {
      fillFromCatalogSite(pick.site);
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
      site,
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
            initialQuery={initialPosition ? undefined : initialLocation?.name}
          />
          <HeldSiteOffer
            suggestion={offer}
            disabled={busy}
            onTake={onTakeHeldSite}
            onDecline={fillFromCatalogSite}
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

        <DiveSiteMapField
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
