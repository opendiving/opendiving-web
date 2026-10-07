"use client";

import dynamic from "next/dynamic";
import { LatLon } from "@/lib/basemap";
import {
  formatCoordinateForForm,
  parseFormPosition,
} from "@/lib/validations/dive-site";
import { Attribution } from "@/components/attribution";

// Still `next/dynamic` although the map is always shown: MapLibre is around
// 250 KB gzipped, and it lives in its own chunk, fetched when this dialog opens
// rather than sitting in the bundle every page pays for. `ssr: false` because
// the picker needs a WebGL2 context, a real element to attach to and the
// resolved theme, none of which exist on the server.
//
// The skeleton's height duplicates the picker's own, and has to keep agreeing
// with it: a placeholder of a different size makes the dialog jump when the
// chunk lands.
const MapPicker = dynamic(
  () => import("./map-picker").then((module) => module.MapPicker),
  {
    ssr: false,
    loading: () => (
      <div className="h-40 w-full animate-pulse rounded-md border bg-muted sm:h-48" />
    ),
  },
);

interface DiveSiteMapFieldProps {
  // The live form values, as strings - the same ones the latitude/longitude
  // inputs are bound to.
  latitude?: string;
  longitude?: string;
  // Called with a position placed on the map, as the form's own strings.
  onPick: (position: { latitude: string; longitude: string }) => void;
  // The licence credit for the name currently in the Location field, while that
  // name still describes the position on screen.
  credit?: string;
  // What to say out loud about the Location field having written itself.
  announcement: string;
}

/**
 * The lazily loaded picker and the credit for whatever named the point that was
 * placed - in the dive site form, and again in its location search dialog.
 *
 * What it does *not* own is the geocoding - `useGeocodedLocation` does, from
 * whichever dialog holds it, because a coordinate pair pasted into the latitude
 * field has to reach the same lookup and never comes through here.
 */
export function DiveSiteMapField({
  latitude,
  longitude,
  onPick,
  credit,
  announcement,
}: DiveSiteMapFieldProps) {
  const position = parseFormPosition(latitude, longitude);

  const handlePick = (picked: LatLon) =>
    onPick({
      latitude: formatCoordinateForForm(picked.latitude),
      longitude: formatCoordinateForForm(picked.longitude),
    });

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
          provider serves both today, and need not tomorrow.

          Through `Attribution` rather than printed, because the API sends the
          licence URL folded into a markdown link - raw, this line would read
          "Location from [Data © OpenStreetMap contributors, ODbL
          1.0.](https://osm.org/copyright)". */}
      <p role="status" className="text-xs text-muted-foreground">
        {credit && (
          <>
            Location from <Attribution value={credit} />
          </>
        )}
        <span className="sr-only">{announcement}</span>
      </p>
    </div>
  );
}
