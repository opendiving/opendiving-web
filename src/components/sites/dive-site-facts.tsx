import type { ReactNode } from "react";
import { ArrowDownToLine, Mountain, Waves, WavesArrowDown } from "lucide-react";
import type { DiveSite } from "@/lib/api/dive-sites";
import {
  ENTRY_TYPE_LABELS,
  vocabularyLabel,
  WATER_TYPE_LABELS,
} from "@/lib/api/dives";
import { IconFact } from "@/components/ui/icon-fact";
import { formatAltitude, formatDepth, type UnitSystem } from "@/lib/units";

// "5 m – 30 m", or the one end the site records.
function depthRange(site: DiveSite, units: UnitSystem): string | null {
  const from = site.depth_from;
  const to = site.depth_to;
  if (from != null && to != null) {
    return `${formatDepth(from, units)} – ${formatDepth(to, units)}`;
  }
  if (from != null) return `From ${formatDepth(from, units)}`;
  if (to != null) return `To ${formatDepth(to, units)}`;
  return null;
}

/**
 * The line under a site's name, on its card and its page's hero alike: where it
 * is, in what water, how deep, how high, and how divers get in - each only where
 * the site records it, and the water only where it is not the sea's, which goes
 * without saying. The icons are the forms' for the same fields, a depth's the
 * one the app marks every depth with.
 */
export function diveSiteFacts(site: DiveSite, units: UnitSystem): ReactNode[] {
  const entryTypes = site.entry_types ?? [];
  const depths = depthRange(site, units);
  return [
    site.location?.name,
    site.water_type && site.water_type !== "salt" && (
      <IconFact icon={Waves} label="Water type">
        {vocabularyLabel(WATER_TYPE_LABELS, site.water_type)}
      </IconFact>
    ),
    depths && (
      <IconFact icon={ArrowDownToLine} label="Depth">
        {depths}
      </IconFact>
    ),
    site.altitude != null && (
      <IconFact icon={Mountain} label="Altitude">
        {formatAltitude(site.altitude, units)}
      </IconFact>
    ),
    entryTypes.length > 0 && (
      <IconFact
        icon={WavesArrowDown}
        label={entryTypes.length > 1 ? "Entry types" : "Entry type"}
      >
        {entryTypes
          .map((entry) => vocabularyLabel(ENTRY_TYPE_LABELS, entry))
          .join(", ")}
      </IconFact>
    ),
  ].filter(Boolean);
}
