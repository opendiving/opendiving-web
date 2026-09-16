// Metric is what this app stores, sends and holds in form state. This module is one
// of exactly two places that changes: it turns a metric number into the string a
// diver reading in feet and psi expects, and turns what they type back into metric.
// `UnitNumberInput` is the other edge, and it is built out of what's here.
//
// Nothing in this file reaches for React or for context. Components read the
// preference once through `useUnits` and pass it down, which is what keeps the gas
// maths in `lib/dive-mixtures.ts`, the Zod schemas, `prefillFromLastDive` and the
// import-apply path unit-blind - they all run on metric values and never learn the
// diver's preference at all.

/** The two systems the app renders in. Mirrors the API's `UnitSystem` StrEnum. */
export const UNIT_SYSTEMS = ["metric", "imperial"] as const;

export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

/**
 * How each system is named in the settings picker.
 *
 * Spelled out as the dimensions themselves rather than as "Metric"/"Imperial" alone,
 * because the word is not the question - which units the numbers will be in is, and a
 * diver who thinks in psi should not have to switch the toggle to find out whether
 * this app agrees with them about what "imperial" covers.
 */
export const UNIT_SYSTEM_LABELS: Record<UnitSystem, string> = {
  metric: "Metric (m · °C · bar · kg · L)",
  imperial: "Imperial (ft · °F · psi · lb · cuft)",
};

// The conversion constants, every one an exact definition rather than a rounded
// figure: the foot has been exactly 0.3048 m since 1959, the pound exactly
// 0.45359237 kg, and the psi is exactly one pound-force over one square inch, which
// resolves to the pascal figure below. Written out so the round trips in
// `units.test.ts` hold to the last digit a double can carry, and so a reader can
// check them against a standard rather than against whoever typed them.

/** Metres in one international foot, exactly. */
export const METERS_PER_FOOT = 0.3048;

/** Kilograms in one avoirdupois pound, exactly. */
export const KG_PER_POUND = 0.45359237;

/** Litres in one cubic foot, exactly (0.3048³ m³). */
export const LITERS_PER_CUBIC_FOOT = 28.316846592;

// Written as its own definition rather than as a decimal literal: a psi is one
// pound-force over one square inch, and the pound-force is the exact pound times
// the exact standard gravity. Typed out as a number it is 6894.757293168361..., and
// a truncated copy of that is a silently wrong constant.
/** Pascals in one psi, from the exact pound, gravity and inch. */
export const PASCALS_PER_PSI = (KG_PER_POUND * 9.80665) / 0.0254 ** 2;

/** Psi in one bar, from the exact pascal definition. ~14.5038. */
export const PSI_PER_BAR = 100000 / PASCALS_PER_PSI;

/** Feet in one international mile, exactly. */
export const FEET_PER_MILE = 5280;

// Geometric feet, not feet of seawater. 1 ft is a length, while "33 fsw per
// atmosphere" is a pressure gauge's calibration - a different quantity that happens
// to be quoted in feet. Depth, visibility, altitude and drift all use the one factor,
// which is also the choice Subsurface makes.

/** Metres to feet. */
export const metersToFeet = (meters: number): number =>
  meters / METERS_PER_FOOT;

/** Feet to metres. */
export const feetToMeters = (feet: number): number => feet * METERS_PER_FOOT;

/** Celsius to Fahrenheit. */
export const celsiusToFahrenheit = (celsius: number): number =>
  (celsius * 9) / 5 + 32;

/** Fahrenheit to Celsius. */
export const fahrenheitToCelsius = (fahrenheit: number): number =>
  ((fahrenheit - 32) * 5) / 9;

/** Kilograms to pounds. */
export const kgToPounds = (kg: number): number => kg / KG_PER_POUND;

/** Pounds to kilograms. */
export const poundsToKg = (pounds: number): number => pounds * KG_PER_POUND;

/** Bar to psi. */
export const barToPsi = (bar: number): number => bar * PSI_PER_BAR;

/** Psi to bar. */
export const psiToBar = (psi: number): number => psi / PSI_PER_BAR;

/** Litres to cubic feet. */
export const litersToCubicFeet = (liters: number): number =>
  liters / LITERS_PER_CUBIC_FOOT;

/** Cubic feet to litres. */
export const cubicFeetToLiters = (cubicFeet: number): number =>
  cubicFeet * LITERS_PER_CUBIC_FOOT;

/**
 * Every measurement this module knows how to convert or label.
 *
 * Keyed by dimension rather than by field, so a second depth column or a third
 * pressure needs no entry here - and so per-dimension preferences, if they are ever
 * wanted, are an additive change to `UnitSystem`'s use rather than a rewrite.
 *
 * Deliberately absent: ppO₂ and surface pressure (bar in both systems, as every dive
 * computer shows them), tank volume (litres is water capacity and cubic feet is gas
 * at a rated pressure the mixture doesn't record - converting between them would be
 * fake maths), O₂/He percentages, CNS/OTU, coordinates and duration.
 */
export type Dimension =
  | "depth"
  | "temperature"
  | "weight"
  | "pressure"
  | "visibility"
  | "altitude"
  | "sac"
  | "rmv"
  | "gasVolume";

/**
 * The dimensions a diver types into, which is what `UnitNumberInput` accepts.
 *
 * The rest are derived figures the API computes and this app only renders.
 *
 * An array rather than a type alone, because two things need the list at
 * runtime: `lib/entry-units.ts` filters a stored override record's keys against
 * it, and the dive form hangs one unit toggle off each entry. `DIMENSIONS` below
 * is module-private and holds the derived figures too, so neither could read the
 * list off that. `satisfies` keeps every entry a real `Dimension` while leaving
 * the literal tuple intact for `EntryDimension` to be read back off it.
 */
export const ENTRY_DIMENSIONS = [
  "depth",
  "temperature",
  "weight",
  "pressure",
  "visibility",
  "altitude",
] as const satisfies readonly Dimension[];

export type EntryDimension = (typeof ENTRY_DIMENSIONS)[number];

interface DimensionSpec {
  /** Short label, as it follows a value and as it sits in a form label's parens. */
  label: Record<UnitSystem, string>;
  /**
   * Spoken form, for the chart descriptions a screen reader reads aloud: "ft" is
   * read as a word rather than as a unit, and "°C" not at all.
   */
  word: Record<UnitSystem, string>;
  /** What sits between value and label. Only temperature attaches its degrees. */
  separator: string;
  /** Metric value to its imperial counterpart. */
  toImperial: (metric: number) => number;
  /** Imperial value back to metric. */
  toMetric: (imperial: number) => number;
  /**
   * Decimals in metric, or `null` for "up to two, trailing zeros trimmed" - which
   * is what every value the API records at two decimals wants.
   */
  metricDecimals: number | null;
  /** Decimals in imperial. Whole numbers for everything but the two rates. */
  imperialDecimals: number;
  /**
   * Whether the metric column stores whole numbers, so imperial entry has to commit
   * a whole one. True for `visibility` and `altitude`, both `Integer` in the DB.
   */
  metricIsInteger: boolean;
}

const DIMENSIONS: Record<Dimension, DimensionSpec> = {
  depth: {
    label: { metric: "m", imperial: "ft" },
    word: { metric: "meters", imperial: "feet" },
    separator: " ",
    toImperial: metersToFeet,
    toMetric: feetToMeters,
    metricDecimals: null,
    imperialDecimals: 0,
    metricIsInteger: false,
  },
  temperature: {
    label: { metric: "°C", imperial: "°F" },
    word: { metric: "degrees Celsius", imperial: "degrees Fahrenheit" },
    // The one attached unit: "24°C" is how a temperature is written everywhere,
    // including on the dive computers these readings come off.
    separator: "",
    toImperial: celsiusToFahrenheit,
    toMetric: fahrenheitToCelsius,
    metricDecimals: null,
    imperialDecimals: 0,
    metricIsInteger: false,
  },
  weight: {
    label: { metric: "kg", imperial: "lb" },
    word: { metric: "kilograms", imperial: "pounds" },
    separator: " ",
    toImperial: kgToPounds,
    toMetric: poundsToKg,
    metricDecimals: null,
    imperialDecimals: 0,
    metricIsInteger: false,
  },
  pressure: {
    label: { metric: "bar", imperial: "psi" },
    word: { metric: "bar", imperial: "psi" },
    separator: " ",
    toImperial: barToPsi,
    toMetric: psiToBar,
    metricDecimals: null,
    imperialDecimals: 0,
    metricIsInteger: false,
  },
  visibility: {
    label: { metric: "m", imperial: "ft" },
    word: { metric: "meters", imperial: "feet" },
    separator: " ",
    toImperial: metersToFeet,
    toMetric: feetToMeters,
    // Whole metres in both directions: visibility is an estimate, the column is an
    // `Integer`, and the form has always stepped by 1.
    metricDecimals: 0,
    imperialDecimals: 0,
    metricIsInteger: true,
  },
  altitude: {
    label: { metric: "m", imperial: "ft" },
    word: { metric: "meters", imperial: "feet" },
    separator: " ",
    toImperial: metersToFeet,
    toMetric: feetToMeters,
    // `Integer` for the same reason as visibility, plus one of its own: the
    // computers that care about altitude bucket it into 300 m bands anyway.
    metricDecimals: 0,
    imperialDecimals: 0,
    metricIsInteger: true,
  },
  sac: {
    label: { metric: "bar/min", imperial: "psi/min" },
    word: { metric: "bar per minute", imperial: "psi per minute" },
    separator: " ",
    toImperial: barToPsi,
    toMetric: psiToBar,
    metricDecimals: null,
    // A whole psi/min would be one significant figure for a typical dive, so this
    // rate keeps a decimal where the scalars don't.
    imperialDecimals: 1,
    metricIsInteger: false,
  },
  rmv: {
    label: { metric: "L/min", imperial: "cuft/min" },
    word: { metric: "liters per minute", imperial: "cubic feet per minute" },
    separator: " ",
    toImperial: litersToCubicFeet,
    toMetric: cubicFeetToLiters,
    metricDecimals: null,
    // Two, because a cubic foot is 28 litres: an RMV a diver reads as 18 L/min is
    // 0.64 cuft/min, and one decimal would round two real rates together.
    imperialDecimals: 2,
    metricIsInteger: false,
  },
  gasVolume: {
    label: { metric: "L", imperial: "cuft" },
    word: { metric: "liters", imperial: "cubic feet" },
    separator: " ",
    toImperial: litersToCubicFeet,
    toMetric: cubicFeetToLiters,
    metricDecimals: null,
    imperialDecimals: 1,
    metricIsInteger: false,
  },
};

/** How many decimals a metric value renders at, up to two, before trimming. */
const METRIC_DECIMALS = 2;

/**
 * Rounds to `decimals` places.
 *
 * One rounding path for display and for entry, so a value that renders as 98 ft
 * commits the metres that render back as 98 ft. Ties go up, as `Math.round` does.
 */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Up to two decimals with trailing zeros dropped. A value the API recorded at two
// decimals renders exactly as it always has ("30.52"), an imported value carrying
// more is cut to the precision the API would have stored ("18.288" -> "18.29"), and
// the corpus's float noise stops leaking into the page ("28.000000000000004" ->
// "28").
function trimmed(value: number): string {
  return String(roundTo(value, METRIC_DECIMALS));
}

/** The value `metric` is displayed as in `units` - unconverted in metric mode. */
export function toDisplayUnits(
  metric: number,
  dimension: Dimension,
  units: UnitSystem,
): number {
  return units === "imperial"
    ? DIMENSIONS[dimension].toImperial(metric)
    : metric;
}

/** The metric value behind a number shown in `units` - unconverted in metric mode. */
export function toMetricUnits(
  display: number,
  dimension: Dimension,
  units: UnitSystem,
): number {
  return units === "imperial"
    ? DIMENSIONS[dimension].toMetric(display)
    : display;
}

/** Whether this dimension's metric column holds whole numbers. */
export function isIntegerDimension(dimension: Dimension): boolean {
  return DIMENSIONS[dimension].metricIsInteger;
}

/**
 * The metric value to store for a number the diver typed in `units`.
 *
 * Rounded after the conversion is inverted, never before, which is what makes entry
 * stable: 98 ft becomes 29.87 m and renders back as 98 ft, because a 2-decimal
 * metric commit is off by at most 0.005 of a unit and that is far under half an
 * imperial display unit for every dimension here. Integer dimensions commit whole
 * metres, and that one *is* lossy - 50 ft lands on 15 m and re-renders as 49 ft.
 */
export function toCommittedMetric(
  display: number,
  dimension: EntryDimension,
  units: UnitSystem,
): number {
  const metric = toMetricUnits(display, dimension, units);
  return isIntegerDimension(dimension)
    ? Math.round(metric)
    : roundTo(metric, METRIC_DECIMALS);
}

export interface FormatOptions {
  /**
   * Fixed decimals for the **metric** rendering, overriding the dimension's own.
   *
   * Imperial is deliberately unaffected. A whole foot is already finer than a
   * tenth of a metre and a hundredth of a cubic foot finer than a tenth of a litre,
   * so a call that coarsens the metric figure on purpose - the dashboard's
   * whole-metre depth, a period-average RMV - has nothing left to coarsen on the
   * other side.
   */
  decimals?: number;
}

/**
 * The bare number a metric value shows as in `units`, with no unit after it.
 *
 * For the places that style the value and its unit separately, and for
 * `UnitNumberInput`, whose `<input>` holds a number and gets its unit from a label.
 */
export function displayNumber(
  metric: number,
  dimension: Dimension,
  units: UnitSystem,
  { decimals }: FormatOptions = {},
): string {
  const shown = toDisplayUnits(metric, dimension, units);
  const spec = DIMENSIONS[dimension];
  const places =
    units === "imperial"
      ? spec.imperialDecimals
      : (decimals ?? spec.metricDecimals);

  return places === null
    ? trimmed(shown)
    : roundTo(shown, places).toFixed(places);
}

/** The short unit label for a dimension - "m"/"ft", "°C"/"°F", "bar/min"/"psi/min". */
export function unitLabel(dimension: Dimension, units: UnitSystem): string {
  return DIMENSIONS[dimension].label[units];
}

/**
 * What sits between a value and this dimension's label - a space, or nothing at
 * all for temperature, which is written "24°C" everywhere including on the dive
 * computers these readings come off.
 *
 * Exported for the profile chart, which works in already-converted display space
 * and so builds its own strings rather than calling a formatter that would convert
 * a second time. Everything else gets the separator through `formatDepth` and its
 * siblings and never has to know it exists.
 */
export function unitSeparator(dimension: Dimension): string {
  return DIMENSIONS[dimension].separator;
}

/**
 * The spoken unit for a dimension - "feet", "degrees Fahrenheit", "psi".
 *
 * For accessible chart descriptions, where the visible label's "ft" is read as a
 * word and "°C" is skipped entirely.
 */
export function unitWord(dimension: Dimension, units: UnitSystem): string {
  return DIMENSIONS[dimension].word[units];
}

/** A metric value with its unit: `"30.52 m"`, `"100 ft"`, `"24°C"`. */
function formatValue(
  metric: number,
  dimension: Dimension,
  units: UnitSystem,
  options?: FormatOptions,
): string {
  const spec = DIMENSIONS[dimension];
  return `${displayNumber(metric, dimension, units, options)}${spec.separator}${spec.label[units]}`;
}

/** A depth in metres, as `"30.52 m"` or `"100 ft"`. */
export function formatDepth(
  meters: number,
  units: UnitSystem,
  options?: FormatOptions,
): string {
  return formatValue(meters, "depth", units, options);
}

/**
 * How fine a foot is written when two depths are being compared. A tenth, which is
 * 3 cm - the nearest imperial has to the centimetre the metric side stores.
 */
const COMPARABLE_IMPERIAL_DECIMALS = 1;

/**
 * Rounds *down* to `decimals` places.
 *
 * Settles the float noise two places finer first: flooring 39.999999999999993 at two
 * decimals gives 39.99, which is the arithmetic's representation error rather than
 * anything the caller meant to say.
 */
function floorTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.floor(roundTo(value, decimals + 2) * factor) / factor;
}

/**
 * A depth written at the scale two depths can be told apart at: two decimals in
 * metric, a tenth of a foot in imperial.
 *
 * `formatDepth` writes imperial as whole feet, which is the resolution a single
 * reading is honest at and too coarse to state a comparison in - a gas breached by a
 * few centimetres prints the same number on both sides, and the sentence reads as a
 * depth past itself.
 *
 * `floor` rounds down rather than to nearest, for a value that is itself a ceiling: a
 * limit rounded up names a depth that is past it, and it is the rounding, not the
 * limit, that then collides with the depth beside it.
 *
 * That closes metric and only narrows imperial. A stored depth and a floored limit
 * sit on the same centimetre grid, so a metric breach always prints two different
 * numbers; a tenth of a foot is 3 cm, so an imperial breach inside the first
 * centimetre still prints one number twice - air at 56.67 m gives "185.9 ft is past
 * this mix's 185.9 ft working limit". Hundredths of a foot would close that too, at
 * two digits on every MOD the app shows, which is precision no cylinder is analysed
 * to.
 */
export function formatComparableDepth(
  meters: number,
  units: UnitSystem,
  { floor = false }: { floor?: boolean } = {},
): string {
  const shown = toDisplayUnits(meters, "depth", units);
  const places =
    units === "imperial" ? COMPARABLE_IMPERIAL_DECIMALS : METRIC_DECIMALS;
  const value = floor ? floorTo(shown, places) : roundTo(shown, places);

  return `${value}${unitSeparator("depth")}${unitLabel("depth", units)}`;
}

/** A temperature in Celsius, as `"23.89°C"` or `"75°F"`. */
export function formatTemperature(
  celsius: number,
  units: UnitSystem,
  options?: FormatOptions,
): string {
  return formatValue(celsius, "temperature", units, options);
}

/** A weight in kilograms, as `"6 kg"` or `"13 lb"`. */
export function formatWeight(
  kg: number,
  units: UnitSystem,
  options?: FormatOptions,
): string {
  return formatValue(kg, "weight", units, options);
}

/** A cylinder pressure in bar, as `"206.84 bar"` or `"3000 psi"`. */
export function formatPressure(
  bar: number,
  units: UnitSystem,
  options?: FormatOptions,
): string {
  return formatValue(bar, "pressure", units, options);
}

/** A visibility in metres, whole in both systems: `"15 m"` or `"49 ft"`. */
export function formatVisibility(meters: number, units: UnitSystem): string {
  return formatValue(meters, "visibility", units);
}

/** An altitude in metres, whole in both systems: `"372 m"` or `"1220 ft"`. */
export function formatAltitude(meters: number, units: UnitSystem): string {
  return formatValue(meters, "altitude", units);
}

/** A surface air consumption in bar/min, as `"0.82 bar/min"` or `"11.9 psi/min"`. */
export function formatSac(
  barPerMinute: number,
  units: UnitSystem,
  options?: FormatOptions,
): string {
  return formatValue(barPerMinute, "sac", units, options);
}

/** A respiratory minute volume in L/min, as `"18.24 L/min"` or `"0.64 cuft/min"`. */
export function formatRmv(
  litersPerMinute: number,
  units: UnitSystem,
  options?: FormatOptions,
): string {
  return formatValue(litersPerMinute, "rmv", units, options);
}

/** A volume of gas in litres, as `"3618 L"` or `"127.8 cuft"`. */
export function formatGasVolume(
  liters: number,
  units: UnitSystem,
  options?: FormatOptions,
): string {
  return formatValue(liters, "gasVolume", units, options);
}

/**
 * A metric bound as the display number that gates the same range in `units`.
 *
 * Native `min`/`max` are declared in metres and Celsius by the caller, because that
 * is what the Zod schema and the DB `CHECK` behind it are written in - so the
 * browser's spinner needs the converted pair, and it has to agree with what the
 * diver sees. Rounded *inward* (a minimum up, a maximum down) so the spinner can
 * never offer a value the metric bound would reject: -450 m becomes -1476 ft, which
 * is -449.9 m back, rather than the -1477 ft that would be -450.2 m.
 */
export function displayBound(
  metric: number,
  dimension: EntryDimension,
  units: UnitSystem,
  side: "min" | "max",
): number {
  // Metric passes through untouched, like every other value in metric mode - the
  // bound is already in the units the schema wrote it in.
  if (units === "metric") return metric;

  const shown = toDisplayUnits(metric, dimension, units);
  return side === "min" ? Math.ceil(shown) : Math.floor(shown);
}
