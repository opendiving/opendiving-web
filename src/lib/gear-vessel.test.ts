import { describe, expect, it } from "vitest";
import { VOLUME_GROUPS } from "./cylinder-presets";
import { vesselFactParts } from "./gear-vessel";
import { toCommittedMetric } from "./units";

describe("vesselFactParts", () => {
  const al80 = { volume: 11.1, working_pressure: 207, material: "aluminium" };
  const steel12 = { volume: 12, working_pressure: 232, material: "steel" };

  it("leads with a named preset's name in metric", () => {
    expect(vesselFactParts(al80, "metric")).toEqual([
      "AL80",
      "11.1 L",
      "207 bar",
      "Aluminium",
    ]);
  });

  it("leads with a named preset's name under imperial units", () => {
    expect(vesselFactParts(al80, "imperial")).toEqual([
      "AL80",
      "11.1 L",
      "3002 psi",
      "Aluminium",
    ]);
  });

  it("names the preset from the bar its psi stamp stores", () => {
    const filled = {
      ...al80,
      working_pressure: toCommittedMetric(3000, "pressure", "imperial"),
    };
    expect(vesselFactParts(filled, "imperial")).toEqual([
      "AL80",
      "11.1 L",
      "3000 psi",
      "Aluminium",
    ]);
  });

  it("states the litres, the bar and the material of an unnamed vessel in metric", () => {
    expect(vesselFactParts(steel12, "metric")).toEqual([
      "12 L",
      "232 bar",
      "Steel",
    ]);
  });

  it("leads an unnamed vessel with its cubic feet under imperial units", () => {
    const parts = vesselFactParts(steel12, "imperial");
    expect(parts[0]).toMatch(/^\d+ cu ft$/);
    expect(parts.slice(1)).toEqual(["12 L", "3365 psi", "Steel"]);
  });

  it("names no preset unless all three facts agree with it", () => {
    expect(vesselFactParts({ ...al80, material: "steel" }, "imperial")[0]).toBe(
      "80 cu ft",
    );
    expect(
      vesselFactParts({ ...al80, working_pressure: 232 }, "imperial")[0],
    ).toMatch(/cu ft$/);
    expect(vesselFactParts({ ...al80, material: null }, "metric")).toEqual([
      "11.1 L",
      "207 bar",
    ]);
  });

  it("tells the HP117 from the LP95, both 15 L, by pressure and material", () => {
    const hp = { volume: 15, working_pressure: 237.3, material: "steel" };
    const lp = { volume: 15, working_pressure: 182, material: "steel" };
    expect(vesselFactParts(hp, "metric")[0]).toBe("HP117");
    expect(vesselFactParts(lp, "metric")[0]).toBe("LP95");
    expect(vesselFactParts({ ...lp, material: "aluminium" }, "metric")[0]).toBe(
      "15 L",
    );
  });

  it.each(
    VOLUME_GROUPS.flatMap((group) => group.options).filter(
      (option) => option.vessel,
    ),
  )("names $label from its own facts", ({ value, imperialName, vessel }) => {
    for (const units of ["metric", "imperial"] as const) {
      expect(vesselFactParts({ volume: value, ...vessel }, units)[0]).toBe(
        imperialName,
      );
    }
  });

  it("names no cubic feet without both the volume and the working pressure", () => {
    expect(vesselFactParts({ volume: 11.1 }, "imperial")).toEqual(["11.1 L"]);
    expect(vesselFactParts({ working_pressure: 207 }, "imperial")).toHaveLength(
      1,
    );
  });

  it("says nothing for a vessel recording nothing", () => {
    expect(
      vesselFactParts(
        { volume: null, working_pressure: null, material: null },
        "metric",
      ),
    ).toEqual([]);
  });

  it("shows a material this build has no label for de-snaked", () => {
    expect(vesselFactParts({ material: "titanium" }, "metric")).toEqual([
      "Titanium",
    ]);
  });
});
