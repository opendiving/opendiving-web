import type { Trip } from "@/lib/api/trips";
import { formatDepth, type UnitSystem } from "@/lib/units";

export interface TripFigure {
  label: string;
  value: string | number;
}

/**
 * What a trip's dives add up to, in the order a card and the trip page show
 * them: their count and their sites' at zero too, their species only once there
 * are some, and their deepest point where there is one - whole units, as a dive
 * card rounds its depths. A card takes the first three, so a trip with species
 * shows those over its depth.
 */
export function tripFigures(trip: Trip, units: UnitSystem): TripFigure[] {
  const figures: TripFigure[] = [
    { label: "Dives", value: trip.dive_count },
    { label: "Dive sites", value: trip.dive_site_count },
  ];
  if (trip.species_count > 0) {
    figures.push({ label: "Species seen", value: trip.species_count });
  }
  if (trip.max_depth != null) {
    figures.push({
      label: "Max depth",
      value: formatDepth(trip.max_depth, units, { decimals: 0 }),
    });
  }
  return figures;
}
