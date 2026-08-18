import { describe, expect, it } from "vitest";
import {
  FEET_PER_MILE,
  KG_PER_POUND,
  LITERS_PER_CUBIC_FOOT,
  METERS_PER_FOOT,
  PSI_PER_BAR,
  UNIT_SYSTEMS,
  displayBound,
  displayNumber,
  formatAltitude,
  formatDepth,
  formatGasVolume,
  formatPressure,
  formatRmv,
  formatSac,
  formatTemperature,
  formatVisibility,
  formatWeight,
  isIntegerDimension,
  roundTo,
  toCommittedMetric,
  toDisplayUnits,
  toMetricUnits,
  unitLabel,
  unitWord,
  type EntryDimension,
} from "./units";

describe("the constants", () => {
  // Exact definitions, not rounded figures. A test on each because these are the
  // one thing in the module a reader cannot check by reasoning about the code -
  // they have to be checked against a standard, and this is where that happens.
  it("are the exact definitions", () => {
    expect(METERS_PER_FOOT).toBe(0.3048);
    expect(KG_PER_POUND).toBe(0.45359237);
    // A cubic foot is 0.3048³ m³, to the last digit.
    expect(LITERS_PER_CUBIC_FOOT).toBeCloseTo(0.3048 ** 3 * 1000, 9);
    expect(FEET_PER_MILE).toBe(5280);
    expect(PSI_PER_BAR).toBeCloseTo(14.503773773020923, 12);
  });

  it("lists both systems and nothing else", () => {
    expect(UNIT_SYSTEMS).toEqual(["metric", "imperial"]);
  });
});

describe("roundTo", () => {
  it("rounds to the requested places", () => {
    expect(roundTo(23.888888888888889, 2)).toBe(23.89);
    expect(roundTo(29.8704, 2)).toBe(29.87);
    expect(roundTo(372.4, 0)).toBe(372);
  });

  // The corpus's float noise, which is the reason display goes through this at all.
  it("collapses float noise", () => {
    expect(roundTo(28.000000000000004, 2)).toBe(28);
  });
});

describe("metric display", () => {
  // Two decimals is what the API records, so a value it stored renders unchanged.
  it("renders a recorded value exactly as stored", () => {
    expect(formatDepth(30.52, "metric")).toBe("30.52 m");
    expect(formatPressure(206.84, "metric")).toBe("206.84 bar");
    expect(formatWeight(6.5, "metric")).toBe("6.5 kg");
  });

  // The two deliberate changes: an imported value carrying more decimals than the
  // API would have stored, and the corpus's float noise.
  it("trims to the precision the API records", () => {
    expect(formatDepth(18.288, "metric")).toBe("18.29 m");
    expect(formatDepth(28.000000000000004, "metric")).toBe("28 m");
  });

  it("drops trailing zeros", () => {
    expect(formatDepth(30.5, "metric")).toBe("30.5 m");
    expect(formatDepth(30, "metric")).toBe("30 m");
    expect(formatDepth(30.0, "metric")).toBe("30 m");
  });

  // Degrees attach, everything else takes a space. This is also the spacing
  // unification: the app used to render `{v}m` in some places and `{v} m` in others.
  it("attaches degrees and spaces everything else", () => {
    expect(formatTemperature(23.89, "metric")).toBe("23.89°C");
    expect(formatVisibility(15, "metric")).toBe("15 m");
  });

  it("keeps the integer dimensions whole", () => {
    expect(formatVisibility(15, "metric")).toBe("15 m");
    expect(formatAltitude(372, "metric")).toBe("372 m");
  });

  it("renders the derived gas figures at the API's precision", () => {
    expect(formatSac(0.82, "metric")).toBe("0.82 bar/min");
    expect(formatRmv(18.24, "metric")).toBe("18.24 L/min");
    expect(formatGasVolume(3618, "metric")).toBe("3618 L");
  });
});

describe("imperial display", () => {
  it("renders the scalars whole", () => {
    expect(formatDepth(30.48, "imperial")).toBe("100 ft");
    expect(formatTemperature(23.89, "imperial")).toBe("75°F");
    expect(formatWeight(6, "imperial")).toBe("13 lb");
    expect(formatPressure(206.84, "imperial")).toBe("3000 psi");
    expect(formatVisibility(15, "imperial")).toBe("49 ft");
    expect(formatAltitude(372, "imperial")).toBe("1220 ft");
  });

  // The rates keep decimals where the scalars don't: a whole psi/min is one
  // significant figure, and a cubic foot is 28 litres.
  it("keeps a decimal on the rates", () => {
    expect(formatSac(0.82, "imperial")).toBe("11.9 psi/min");
    expect(formatRmv(18.24, "imperial")).toBe("0.64 cuft/min");
    expect(formatGasVolume(3618, "imperial")).toBe("127.8 cuft");
  });

  it("handles temperatures below freezing", () => {
    expect(formatTemperature(0, "imperial")).toBe("32°F");
    expect(formatTemperature(-50, "imperial")).toBe("-58°F");
  });

  it("handles an altitude below sea level", () => {
    expect(formatAltitude(-430, "imperial")).toBe("-1411 ft");
  });
});

describe("the metric decimals override", () => {
  // The dashboard's Recent Dives row wants a whole metre; the MOD/END/EAD strings
  // want one decimal, which is what they have always printed.
  it("fixes the metric decimals", () => {
    expect(formatDepth(30.52, "metric", { decimals: 0 })).toBe("31 m");
    expect(formatDepth(30, "metric", { decimals: 1 })).toBe("30.0 m");
    expect(formatRmv(18.24, "metric", { decimals: 1 })).toBe("18.2 L/min");
  });

  // Deliberate: a whole foot is already finer than a tenth of a metre, so there is
  // nothing left to coarsen on the imperial side.
  it("leaves imperial alone", () => {
    expect(formatDepth(30.48, "imperial", { decimals: 1 })).toBe("100 ft");
    expect(formatRmv(18.24, "imperial", { decimals: 1 })).toBe("0.64 cuft/min");
  });
});

describe("labels", () => {
  it("names the short unit per system", () => {
    expect(unitLabel("depth", "metric")).toBe("m");
    expect(unitLabel("depth", "imperial")).toBe("ft");
    expect(unitLabel("temperature", "imperial")).toBe("°F");
    expect(unitLabel("pressure", "imperial")).toBe("psi");
    expect(unitLabel("weight", "imperial")).toBe("lb");
    expect(unitLabel("rmv", "imperial")).toBe("cuft/min");
    expect(unitLabel("sac", "imperial")).toBe("psi/min");
  });

  // Spoken forms, for the chart descriptions: "ft" is read as a word and "°C" is
  // skipped entirely.
  it("spells the unit out for a screen reader", () => {
    expect(unitWord("depth", "imperial")).toBe("feet");
    expect(unitWord("temperature", "imperial")).toBe("degrees Fahrenheit");
    expect(unitWord("temperature", "metric")).toBe("degrees Celsius");
    expect(unitWord("pressure", "imperial")).toBe("psi");
    expect(unitWord("rmv", "imperial")).toBe("cubic feet per minute");
    expect(unitWord("rmv", "metric")).toBe("liters per minute");
  });
});

describe("conversion in and out", () => {
  it("passes metric through untouched", () => {
    expect(toDisplayUnits(30.48, "depth", "metric")).toBe(30.48);
    expect(toMetricUnits(30.48, "depth", "metric")).toBe(30.48);
    expect(displayNumber(30.52, "depth", "metric")).toBe("30.52");
  });

  it("converts to imperial", () => {
    expect(toDisplayUnits(30.48, "depth", "imperial")).toBeCloseTo(100, 10);
    expect(toDisplayUnits(0, "temperature", "imperial")).toBe(32);
    expect(toDisplayUnits(1, "pressure", "imperial")).toBeCloseTo(14.5038, 4);
  });

  it("knows which metric columns are whole numbers", () => {
    expect(isIntegerDimension("visibility")).toBe(true);
    expect(isIntegerDimension("altitude")).toBe(true);
    expect(isIntegerDimension("depth")).toBe(false);
    expect(isIntegerDimension("temperature")).toBe(false);
  });
});

describe("entry round-trips", () => {
  // The guarantee the whole entry design rests on: what the diver typed is what
  // comes back, because the conversion is inverted before the metric value is
  // rounded. Every whole imperial value in each dimension's plausible range.
  const cases: Array<{
    dimension: EntryDimension;
    from: number;
    to: number;
    step?: number;
  }> = [
    { dimension: "depth", from: 0, to: 500 },
    { dimension: "temperature", from: -58, to: 122 },
    { dimension: "weight", from: 0, to: 100 },
    { dimension: "pressure", from: 0, to: 5000, step: 10 },
  ];

  for (const { dimension, from, to, step = 1 } of cases) {
    it(`round-trips every whole imperial ${dimension}`, () => {
      const broken: number[] = [];
      for (let typed = from; typed <= to; typed += step) {
        const metric = toCommittedMetric(typed, dimension, "imperial");
        if (Number(displayNumber(metric, dimension, "imperial")) !== typed) {
          broken.push(typed);
        }
      }
      expect(broken).toEqual([]);
    });
  }

  // The exact values the plan's verification steps assert against the API.
  it("commits the documented metric values", () => {
    expect(toCommittedMetric(100, "depth", "imperial")).toBe(30.48);
    expect(toCommittedMetric(75, "temperature", "imperial")).toBe(23.89);
    expect(toCommittedMetric(3000, "pressure", "imperial")).toBe(206.84);
    expect(toCommittedMetric(33, "visibility", "imperial")).toBe(10);
    expect(toCommittedMetric(1220, "altitude", "imperial")).toBe(372);
  });

  // Metric entry commits at the API's own precision. This is the one deliberate
  // change on the metric side, and it is invisible for `step`-compliant input -
  // it generalizes what the temperature field already did to its float siblings.
  it("rounds metric entry to two decimals", () => {
    expect(toCommittedMetric(23.888888888888889, "temperature", "metric")).toBe(
      23.89,
    );
    expect(toCommittedMetric(30.52, "depth", "metric")).toBe(30.52);
  });

  it("commits whole metres for the integer dimensions", () => {
    expect(toCommittedMetric(15.4, "visibility", "metric")).toBe(15);
    expect(toCommittedMetric(372.6, "altitude", "metric")).toBe(373);
  });

  // The accepted loss, pinned so it cannot drift into something worse: an
  // `Integer` column cannot hold the metres 50 ft is, so it re-renders as 49 ft.
  // Widening the column to a Float was considered and rejected - whole-metre
  // resolution is the recorded entry convention, and visibility is an estimate.
  it("loses a foot of visibility to the integer column", () => {
    const metric = toCommittedMetric(50, "visibility", "imperial");
    expect(metric).toBe(15);
    expect(formatVisibility(metric, "imperial")).toBe("49 ft");
  });

  // A common altitude that does survive, which is why the loss above is tolerable.
  it("round-trips a common altitude", () => {
    const metric = toCommittedMetric(1220, "altitude", "imperial");
    expect(metric).toBe(372);
    expect(formatAltitude(metric, "imperial")).toBe("1220 ft");
  });
});

describe("displayBound", () => {
  // Rounded inward, so the browser's spinner can never offer a value the metric
  // bound behind it rejects.
  it("converts a bound inward", () => {
    expect(displayBound(-450, "altitude", "imperial", "min")).toBe(-1476);
    expect(displayBound(6500, "altitude", "imperial", "max")).toBe(21325);
    expect(displayBound(-50, "temperature", "imperial", "min")).toBe(-58);
    expect(displayBound(50, "temperature", "imperial", "max")).toBe(122);
  });

  it("keeps a converted bound inside the metric one", () => {
    expect(
      toCommittedMetric(
        displayBound(-450, "altitude", "imperial", "min"),
        "altitude",
        "imperial",
      ),
    ).toBeGreaterThanOrEqual(-450);
    expect(
      toCommittedMetric(
        displayBound(6500, "altitude", "imperial", "max"),
        "altitude",
        "imperial",
      ),
    ).toBeLessThanOrEqual(6500);
  });

  it("passes a metric bound through untouched", () => {
    expect(displayBound(-450, "altitude", "metric", "min")).toBe(-450);
    expect(displayBound(0.5, "depth", "metric", "min")).toBe(0.5);
  });
});
