"use client";

import type { DiveSite } from "@/lib/api/dive-sites";
import { ENTRY_TYPE_LABELS, WATER_TYPE_LABELS } from "@/lib/api/dives";
import { labelOrFallback } from "@/lib/api/labels";
import { useUnits } from "@/hooks/useUnits";
import { formatAltitude, formatDepth } from "@/lib/units";
import { formatCoordinateForForm } from "@/lib/validations/coordinates";
import { ExternalIdLink } from "@/components/sites/external-id-link";
import {
  RecordInfoDialog,
  type RecordInfoSection,
} from "@/components/ui/record-info-dialog";

// The site's own fields in the site form's order.
export function DiveSiteInfoDialog({ site }: { site: DiveSite }) {
  const units = useUnits();
  const externalIds = site.external_ids ?? [];
  const entryTypes = site.entry_types ?? [];

  const sections: RecordInfoSection[] = [
    {
      facts: [
        { label: "Name", value: site.name },
        { label: "Other names", value: site.other_names?.join(", ") },
        { label: "Location", value: site.location?.name },
        { label: "Latitude", value: formatCoordinateForForm(site.latitude) },
        { label: "Longitude", value: formatCoordinateForForm(site.longitude) },
        {
          label: "In other registries",
          value:
            externalIds.length > 0 ? (
              <ul className="space-y-1 font-normal">
                {externalIds.map((entry) => (
                  <li key={`${entry.registry}:${entry.identifier}`}>
                    <ExternalIdLink entry={entry} />
                  </li>
                ))}
              </ul>
            ) : null,
          wide: true,
        },
        {
          label: "Depth from",
          value:
            site.depth_from == null
              ? null
              : formatDepth(site.depth_from, units),
        },
        {
          label: "Depth to",
          value:
            site.depth_to == null ? null : formatDepth(site.depth_to, units),
        },
        {
          label: "Water type",
          value: site.water_type
            ? labelOrFallback(WATER_TYPE_LABELS, site.water_type)
            : null,
        },
        {
          label: "Altitude",
          value:
            site.altitude == null ? null : formatAltitude(site.altitude, units),
        },
        {
          label: "Entry types",
          value: entryTypes
            .map((entry) => labelOrFallback(ENTRY_TYPE_LABELS, entry))
            .join(", "),
        },
        { label: "Tags", value: site.tags?.join(", ") },
        { label: "Notes", value: site.notes, wide: true },
      ],
    },
  ];

  return <RecordInfoDialog title="Dive site information" sections={sections} />;
}
