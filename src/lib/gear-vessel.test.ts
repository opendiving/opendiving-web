import { describe, expect, it } from "vitest";
import { vesselFactParts } from "./gear-vessel";

describe("vesselFactParts", () => {
  const al80 = { volume: 11.1, working_pressure: 207, material: "aluminium" };

  it("states the litres, the bar and the material in metric", () => {
    expect(vesselFactParts(al80, "metric")).toEqual([
      "11.1 L",
      "207 bar",
      "Aluminium",
    ]);
  });

  it("leads with the cubic feet under imperial units", () => {
    const parts = vesselFactParts(al80, "imperial");
    expect(parts[0]).toBe("80 cu ft");
    expect(parts.slice(1, 2)).toEqual(["11.1 L"]);
    expect(parts[2]).toMatch(/psi$/);
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
