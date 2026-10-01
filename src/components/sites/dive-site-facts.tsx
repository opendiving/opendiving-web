import { Fragment, type ReactNode } from "react";
import { Mountain, Waves, WavesArrowDown, type LucideIcon } from "lucide-react";
import type { DiveSite } from "@/lib/api/dive-sites";
import {
  ENTRY_TYPE_LABELS,
  vocabularyLabel,
  WATER_TYPE_LABELS,
} from "@/lib/api/dives";
import { formatAltitude, type UnitSystem } from "@/lib/units";

// A fact marked by an icon, which a screen reader hears as its label. The icon
// is the text's height, and glows as the text does, through a filter:
// `text-shadow` stops at an SVG.
function IconFact({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="whitespace-nowrap">
      <Icon
        aria-hidden
        className="mr-0.5 inline-block size-[1em] align-[-0.125em] [filter:drop-shadow(0_0_2px_var(--backdrop-fade))_drop-shadow(0_0_5px_var(--backdrop-fade))]"
      />
      <span className="sr-only">{label} </span>
      {children}
    </span>
  );
}

/**
 * The line under a site's name, on its card and its page's hero alike: where it
 * is, in what water, how high, and how divers get in - each only where the site
 * records it. The icons are the forms' for the same fields.
 */
export function diveSiteFacts(site: DiveSite, units: UnitSystem): ReactNode[] {
  const entryTypes = site.entry_types ?? [];
  return [
    site.location?.name,
    site.water_type && (
      <IconFact icon={Waves} label="Water type">
        {vocabularyLabel(WATER_TYPE_LABELS, site.water_type)}
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

export function DiveSiteFacts({ facts }: { facts: ReactNode[] }) {
  return facts.map((fact, index) => (
    <Fragment key={index}>
      {index > 0 && " · "}
      {fact}
    </Fragment>
  ));
}
