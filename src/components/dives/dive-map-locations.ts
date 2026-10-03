import type { Dive } from "@/lib/api/dives";
import type { GeoPoint } from "@/lib/geo-distance";
import type { MappableLocation } from "@/lib/map-frame";

// A recorded pair as a point, or null when the dive has no fix on that side.
//
// `== null`, not falsiness: a dive off West Africa exits at longitude 0 and one
// in the Galápagos at latitude 0, and both are positions rather than absences.
export function fixPoint(
  latitude?: number | null,
  longitude?: number | null,
): GeoPoint | null {
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude };
}

// Where a dive is on a map: its sites where they are pinned, and where the dive
// computer put the diver, which is a different claim - so both are drawn, and
// the ring/dot pair is what tells them apart. Exit-only is the ordinary case,
// not half a reading: every GPS-carrying export in the API's corpus takes its
// first fix after surfacing.
export function diveMapLocations(dive: Dive): MappableLocation[] {
  const entry = fixPoint(dive.entry_latitude, dive.entry_longitude);
  const exit = fixPoint(dive.exit_latitude, dive.exit_longitude);
  return [
    ...dive.dive_sites.map((site) => ({
      name: site.name,
      latitude: site.latitude,
      longitude: site.longitude,
    })),
    ...(entry ? [{ name: "Entry", ...entry, variant: "fix" as const }] : []),
    ...(exit ? [{ name: "Exit", ...exit, variant: "fix" as const }] : []),
  ];
}

export function hasMapPosition(locations: MappableLocation[]): boolean {
  return locations.some(
    (location) => location.latitude != null && location.longitude != null,
  );
}
