import { displayNumber, toCommittedMetric, type UnitSystem } from "@/lib/units";
import type { CylinderMaterial, VesselFacts } from "@/lib/api/gear";

/** The vessel facts a cylinder's name pins down beyond its litres. */
export interface PresetVessel extends Pick<
  VesselFacts,
  "working_pressure" | "material"
> {
  working_pressure: number;
  material: CylinderMaterial;
}

// A rating in bar exactly as the working-pressure box stores the stamped psi typed
// in imperial, so an imperial reader reads the stamp back and a metric reader sees
// what that same entry shows.
function ratedAt(psi: number, material: CylinderMaterial): PresetVessel {
  return {
    working_pressure: toCommittedMetric(psi, "pressure", "imperial"),
    material,
  };
}

const AL_3000 = ratedAt(3000, "aluminium");
const HP_3442 = ratedAt(3442, "steel");
// LP cylinders are named at their "+" rating, 10% over the stamped 2400 psi: at
// 2400 an LP85 holds 75 cu ft, so only 2640 reads the name back.
const LP_2640 = ratedAt(2640, "steel");

export interface VolumeOption {
  value: number;
  label: string;
  /**
   * The cu-ft name this cylinder is known by, where it has one.
   *
   * Only the US sizes carry one, and it always states the material: `AL` for
   * aluminium, `HP` and `LP` for the two steel working-pressure families.
   * `24 L (2x12 L)`'s parenthetical looks like the same thing and is not - it is
   * a metric composition, so it is part of `label` and never leads.
   */
  imperialName?: string;
  /**
   * The working pressure and material the name pins down, on every row with an
   * `imperialName` and no other: a 12 L is made at 200, 232 and 300 bar in steel
   * and in aluminium, so litres alone say neither.
   */
  vessel?: PresetVessel;
}

export interface VolumeOptionGroup {
  /** Heading shown above the group in the dropdown. */
  label: string;
  /**
   * Whose divers this group is *for*, which decides only where it sits.
   *
   * Never whether it is shown: every group is offered to every diver, and
   * `volumeGroupsFor` moves the reader's own to the front rather than dropping
   * the rest. See DECISIONS.md - a list that hides the unfamiliar half is a list
   * that fails the traveller, who is the one person a named preset is for.
   *
   * Absent where a group belongs to neither family, which sinks it below both.
   */
  system?: UnitSystem;
  options: VolumeOption[];
}

const TWIN_SETS: VolumeOption[] = [
  { value: 14, label: "14 L (2x7 L)" },
  {
    value: 22.2,
    label: "22.2 L (2x AL80)",
    imperialName: "2x AL80",
    vessel: AL_3000,
  },
  { value: 24, label: "24 L (2x12 L)" },
  { value: 30, label: "30 L (2x15 L)" },
];

/**
 * Whether a cylinder's litres are one of the twin-set presets: the only way a
 * cylinder says it is a twin set, since a mixture records nothing but its volume.
 * No single in the presets shares a total with them.
 */
export function isTwinSetVolume(volume: number | null | undefined): boolean {
  return TWIN_SETS.some((option) => option.value === volume);
}

// Common cylinder water capacities (litres), in four groups.
//
// The named entries are the US sizes, carrying the name divers actually say
// alongside the litre water capacity the mixture stores; the unnamed ones are the
// European sizes, which have no name beyond their capacity.
//
// A US name states the material because the litres depend on it: an AL80 at
// 3000 psi is 11.1 L and a steel HP80 at 3442 psi is 10.2 L, and both are "80
// cubic feet". `AL` is aluminium - Luxfer and Catalina model-number that line
// `S80`, an `S` divers read as steel, which is why the model number is not what
// is shown here (see DECISIONS.md). `HP` is the 3442 psi steel family and `LP`
// the 2400/2640 psi one, from Faber and Worthington.
//
// A named row also carries the working pressure and material its name pins down,
// from the makers' rating families: 3000 psi aluminium (Luxfer, Catalina), 3300
// psi for the AL100 (Luxfer's S100), 3442 psi HP steel and 2400+ LP steel (Faber,
// Worthington). An unnamed row carries neither.
//
// Every litre figure is a manufacturer's stated water capacity - Luxfer's and
// Catalina's scuba sheets via XS Scuba, XS Scuba's Metal Impact sheet, Faber's
// and Worthington's own - never a number derived from the cu-ft name. Where the
// sheets disagree, that row's comment gives the figures and says which one the
// preset takes, so the next person to touch it can see it was a choice.
export const VOLUME_GROUPS: VolumeOptionGroup[] = [
  {
    label: "Metric singles",
    system: "metric",
    // Ascending by litres, which is the quantity stored and the only thing these
    // are known by.
    options: [
      { value: 3, label: "3 L" },
      { value: 5, label: "5 L" },
      { value: 7, label: "7 L" },
      { value: 10, label: "10 L" },
      { value: 12, label: "12 L" },
      { value: 15, label: "15 L" },
      { value: 18, label: "18 L" },
      { value: 20, label: "20 L" },
    ],
  },
  {
    label: "Twin sets",
    // No `system`, so this sits under both families whichever way the diver
    // reads: a twin set is asked for by its total either way, and it is the
    // rarer pick, so the singles a diver reaches for most are the rows nearest
    // the box. The 2x AL80 rides along rather than splitting the group by
    // material.
    options: TWIN_SETS,
  },
  {
    label: "US aluminium",
    system: "imperial",
    // Nominal cu ft ascending, which for this family is also litres ascending.
    options: [
      // The standard stage/deco/pony bottle. Luxfer 5.7, Catalina 5.8; the preset
      // takes Luxfer's, theirs being the AL40 most often sold under the name.
      {
        value: 5.7,
        label: "5.7 L (AL40)",
        imperialName: "AL40",
        vessel: AL_3000,
      },
      // Luxfer 6.9, Metal Impact 7.1, Catalina 7.2 - a 0.3 L spread with no maker
      // dominant enough to settle it the way Faber settles the HP100. The preset
      // takes the middle figure; a diver whose own sheet says 6.9 types it.
      {
        value: 7.1,
        label: "7.1 L (AL50)",
        imperialName: "AL50",
        vessel: AL_3000,
      },
      {
        value: 9,
        label: "9 L (AL63)",
        imperialName: "AL63",
        vessel: AL_3000,
      },
      {
        value: 10,
        label: "10 L (AL72)",
        imperialName: "AL72",
        vessel: AL_3000,
      },
      {
        value: 11.1,
        label: "11.1 L (AL80)",
        imperialName: "AL80",
        vessel: AL_3000,
      },
      // Rated 3300 psi, unlike the rest of the family.
      {
        value: 13.2,
        label: "13.2 L (AL100)",
        imperialName: "AL100",
        vessel: ratedAt(3300, "aluminium"),
      },
    ],
  },
  {
    label: "US steel",
    system: "imperial",
    // Two families, each in nominal cu ft order, HP before LP - so the group is
    // deliberately not ascending by litres across the join (HP130 is 16 L and the
    // LP85 under it is 13 L). A diver reaches for one family or the other.
    options: [
      // Faber 10.2, Worthington 10.1. The preset takes Faber's, for the reason the
      // HP100 below does - one maker across the family beats a row-by-row pick,
      // and a tenth of a litre is well inside what a diver would retype anyway.
      {
        value: 10.2,
        label: "10.2 L (HP80)",
        imperialName: "HP80",
        vessel: HP_3442,
      },
      // The one size the makers genuinely disagree on: Faber 12.9, Worthington's
      // own sheet 11.6, PST 12.7. Faber's figure is the preset because it is the
      // one most often sold under the name; a diver holding either types theirs.
      {
        value: 12.9,
        label: "12.9 L (HP100)",
        imperialName: "HP100",
        vessel: HP_3442,
      },
      // The HP117 and the LP95 below are both 15.0 L - two cylinders that differ
      // by a working pressure the mixture does not record. Hence the list is keyed
      // by label rather than value: the value is not unique.
      {
        value: 15,
        label: "15 L (HP117)",
        imperialName: "HP117",
        vessel: HP_3442,
      },
      {
        value: 15.3,
        label: "15.3 L (HP120)",
        imperialName: "HP120",
        vessel: HP_3442,
      },
      // Worthington's X8-130. Faber has no 130; its nearest is the HP133 at 17 L,
      // which is a different cylinder rather than a second figure for this one.
      {
        value: 16,
        label: "16 L (HP130)",
        imperialName: "HP130",
        vessel: HP_3442,
      },
      {
        value: 13,
        label: "13 L (LP85)",
        imperialName: "LP85",
        vessel: LP_2640,
      },
      {
        value: 15,
        label: "15 L (LP95)",
        imperialName: "LP95",
        vessel: LP_2640,
      },
      {
        value: 17,
        label: "17 L (LP108)",
        imperialName: "LP108",
        vessel: LP_2640,
      },
      {
        value: 19,
        label: "19 L (LP121)",
        imperialName: "LP121",
        vessel: LP_2640,
      },
    ],
  },
];

const NAMED_PRESETS = VOLUME_GROUPS.flatMap((group) => group.options).filter(
  (option): option is VolumeOption & Required<Pick<VolumeOption, "vessel">> =>
    option.vessel !== undefined,
);

// Whether two pressures in bar read as the same whole figure in either unit: a
// stamp typed as 3000 psi stores 206.84 bar and the same cylinder typed as 207 bar
// reads 3002 psi, so neither unit alone recognises both.
function samePressureReading(a: number, b: number): boolean {
  return (["metric", "imperial"] as const).some(
    (units) =>
      displayNumber(a, "pressure", units, { decimals: 0 }) ===
      displayNumber(b, "pressure", units, { decimals: 0 }),
  );
}

/**
 * The name of the preset a vessel's recorded facts are, or `undefined`.
 *
 * All three facts must be recorded and agree with the row's, which is what tells
 * the HP117 from the LP95: both are 15 L.
 */
export function presetNameFor({
  volume,
  working_pressure: pressure,
  material,
}: VesselFacts): string | undefined {
  if (volume == null || pressure == null || !material) return undefined;
  return NAMED_PRESETS.find(
    ({ value, vessel }) =>
      value === volume &&
      vessel.material === material &&
      samePressureReading(vessel.working_pressure, pressure),
  )?.imperialName;
}
