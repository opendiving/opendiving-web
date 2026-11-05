import type { ReactNode } from "react";

import { ExternalIdLink } from "@/components/sites/external-id-link";
import type { DiveSiteSharedMembers } from "@/lib/api/dive-sites";
import { ENTRY_TYPE_LABELS, WATER_TYPE_LABELS } from "@/lib/api/dives";
import { labelOrFallback } from "@/lib/api/labels";
import { formatAltitude, formatDepth, type UnitSystem } from "@/lib/units";

// A site's shared members as a reader meets them, row by row: the review queue
// against a change, and the proposer's preview of what would be published.
export interface SharedMemberRow {
  label: string;
  // The wire's names for what the row shows, which is what `changed` holds.
  keys: (keyof DiveSiteSharedMembers)[];
  show: (members: DiveSiteSharedMembers, units: UnitSystem) => ReactNode;
}

export const SHARED_MEMBER_ROWS: SharedMemberRow[] = [
  { label: "Name", keys: ["name"], show: (members) => members.name },
  {
    label: "Other names",
    keys: ["other_names"],
    show: (members) => members.other_names.join(", "),
  },
  {
    label: "Pin",
    keys: ["latitude", "longitude"],
    show: ({ latitude, longitude }) =>
      latitude !== null && `${latitude}, ${longitude}`,
  },
  {
    label: "Location",
    keys: ["location_name"],
    show: (members) => members.location_name,
  },
  {
    label: "Depth from",
    keys: ["depth_from"],
    show: ({ depth_from }, units) =>
      depth_from !== null && formatDepth(depth_from, units),
  },
  {
    label: "Depth to",
    keys: ["depth_to"],
    show: ({ depth_to }, units) =>
      depth_to !== null && formatDepth(depth_to, units),
  },
  {
    label: "Water type",
    keys: ["water_type"],
    show: ({ water_type }) =>
      water_type && labelOrFallback(WATER_TYPE_LABELS, water_type),
  },
  {
    label: "Altitude",
    keys: ["altitude"],
    show: ({ altitude }, units) =>
      altitude !== null && formatAltitude(altitude, units),
  },
  {
    label: "Entry types",
    keys: ["entry_types"],
    show: ({ entry_types }) =>
      entry_types
        .map((entry) => labelOrFallback(ENTRY_TYPE_LABELS, entry))
        .join(", "),
  },
  {
    label: "Registries",
    keys: ["external_ids"],
    show: ({ external_ids }) =>
      external_ids.length > 0 && (
        <ul>
          {external_ids.map((entry) => (
            <li key={`${entry.registry}:${entry.identifier}`}>
              <ExternalIdLink entry={entry} />
            </li>
          ))}
        </ul>
      ),
  },
];
