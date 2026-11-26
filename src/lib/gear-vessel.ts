import { cylinderMaterialLabel, type VesselFacts } from "@/lib/api/gear";
import { presetNameFor } from "@/lib/cylinder-presets";
import {
  unitSystemFor,
  cylinderCubicFeet,
  formatPressure,
  type UnitSelection,
} from "@/lib/units";

/**
 * A vessel's recorded facts as a line of parts - "11.1 L", "207 bar", "Aluminium" -
 * or none where nothing is recorded.
 *
 * A vessel whose facts are a named preset's leads with that name in both systems:
 * "AL80" is what the cylinder is, not a unit, and the number on it is the one a
 * diver reads - correcting the computed figure for compressibility would read an
 * AL80 as 78, no closer to its name. Any other vessel leads, under imperial, with
 * its cubic feet computed from the volume and the working pressure; metric has no
 * such figure. The litres always follow, since they are what a dive's tank records.
 */
export function vesselFactParts(
  facts: VesselFacts,
  units: UnitSelection,
): string[] {
  const parts: string[] = [];
  const { volume, working_pressure: pressure, material } = facts;
  const name = presetNameFor(facts);
  if (name) {
    parts.push(name);
  } else if (
    unitSystemFor("volume", units) === "imperial" &&
    volume != null &&
    pressure != null
  ) {
    parts.push(`${cylinderCubicFeet(volume, pressure)} cu ft`);
  }
  if (volume != null) parts.push(`${volume} L`);
  if (pressure != null) parts.push(formatPressure(pressure, units));
  if (material) parts.push(cylinderMaterialLabel(material));
  return parts;
}
