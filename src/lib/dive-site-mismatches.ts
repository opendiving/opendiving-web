import type { DiveSiteLookupItem } from "@/lib/api/dive-sites";
import { vocabularyLabel, WATER_TYPE_LABELS } from "@/lib/api/dives";
import { formatAltitude, type UnitSystem } from "@/lib/units";

type ComparedSite = Pick<
  DiveSiteLookupItem,
  "name" | "water_type" | "altitude"
>;

/**
 * Per site of one dive, in order, what sets it apart from the first site that
 * records the same property: its water type, and its altitude in whole metres -
 * the precision every altitude is shown at. The first such site is the reference
 * and never differs from itself; a site recording neither has nothing to say.
 */
export function diveSiteMismatches(
  sites: readonly ComparedSite[],
  units: UnitSystem,
): string[][] {
  const water = sites.find((site) => site.water_type);
  const altitude = sites.find((site) => site.altitude != null);
  const waterLabel = (site: ComparedSite) =>
    vocabularyLabel(WATER_TYPE_LABELS, site.water_type ?? "");

  return sites.map((site) => {
    const mismatches: string[] = [];
    if (water && site.water_type && site.water_type !== water.water_type) {
      mismatches.push(
        `${waterLabel(site)}, unlike ${water.name} (${waterLabel(water).toLowerCase()})`,
      );
    }
    if (
      altitude?.altitude != null &&
      site.altitude != null &&
      Math.round(site.altitude) !== Math.round(altitude.altitude)
    ) {
      mismatches.push(
        `Altitude ${formatAltitude(site.altitude, units)}, unlike ${altitude.name} (${formatAltitude(altitude.altitude, units)})`,
      );
    }
    return mismatches;
  });
}
