import type { ReviewMarker } from "@/components/map/proposal-map";
import type { AdminDiveSiteProposal } from "@/lib/api/admin";
import type { DiveSiteSharedMembers } from "@/lib/api/dive-sites";
import { formatDistance, haversineMeters } from "@/lib/geo-distance";
import type { GeoPoint } from "@/lib/geo-distance";
import type { UnitSystem } from "@/lib/units";

function pinOf(
  place: Pick<DiveSiteSharedMembers, "latitude" | "longitude">,
): GeoPoint | null {
  const { latitude, longitude } = place;
  return latitude === null || longitude === null
    ? null
    : { latitude, longitude };
}

/** How far a change moves the record's pin, in metres; null where it moves none. */
export function pinMoveMetres(proposal: AdminDiveSiteProposal): number | null {
  const proposed = pinOf(proposal.proposed);
  const current = pinOf(proposal.current);
  if (proposal.kind !== "change" || !proposed || !current) return null;
  const metres = haversineMeters(current, proposed);
  return metres > 0 ? metres : null;
}

/**
 * What the review map draws, the proposed pin first since the map centres on it: a
 * change's current pin where the change moves it, and every match that has a pin,
 * named with how far it is. A proposal with no pin has nothing to centre on.
 */
export function reviewMarkers(
  proposal: AdminDiveSiteProposal,
  units: UnitSystem,
): ReviewMarker[] {
  const proposed = pinOf(proposal.proposed);
  if (!proposed) return [];

  const markers: ReviewMarker[] = [
    { kind: "proposed", label: "Proposed", ...proposed },
  ];
  const current = pinOf(proposal.current);
  if (current && pinMoveMetres(proposal) !== null) {
    markers.push({ kind: "current", label: "Current", ...current });
  }
  for (const match of proposal.matches) {
    const pin = pinOf(match);
    if (!pin) continue;
    const distance =
      match.distance_metres === null
        ? ""
        : ` · ${formatDistance(match.distance_metres, units)}`;
    markers.push({ kind: "match", label: `${match.name}${distance}`, ...pin });
  }
  return markers;
}

/** The pin on openstreetmap.org, for a look at what the app's basemap leaves out. */
export function openStreetMapPinHref({ latitude, longitude }: GeoPoint) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
}
