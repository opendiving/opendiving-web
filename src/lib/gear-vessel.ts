import { cylinderMaterialLabel, type VesselFacts } from "@/lib/api/gear";
import {
  cylinderCubicFeet,
  formatPressure,
  type UnitSystem,
} from "@/lib/units";

/**
 * A vessel's recorded facts as a line of parts - "11.1 L", "207 bar", "Aluminium" -
 * or none where nothing is recorded.
 *
 * Imperial leads with the cubic-foot capacity the cylinder is named by, which needs
 * both the volume and the working pressure; the litres stay beside it, since they are
 * what a dive's tank records. Metric has no such figure to lead with.
 */
export function vesselFactParts(
  facts: VesselFacts,
  units: UnitSystem,
): string[] {
  const parts: string[] = [];
  const { volume, working_pressure: pressure, material } = facts;
  if (units === "imperial" && volume != null && pressure != null) {
    parts.push(`${cylinderCubicFeet(volume, pressure)} cu ft`);
  }
  if (volume != null) parts.push(`${volume} L`);
  if (pressure != null) parts.push(formatPressure(pressure, units));
  if (material) parts.push(cylinderMaterialLabel(material));
  return parts;
}
