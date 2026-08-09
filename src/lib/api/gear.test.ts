import { describe, it, expect } from "vitest";
import { gearItemLabel, gearTypeLabel, GEAR_TYPES } from "./gear";

describe("gearItemLabel", () => {
  it("prefixes the name with the brand when there is one", () => {
    expect(gearItemLabel({ name: "MK25 EVO", brand: "Scubapro" })).toBe(
      "Scubapro MK25 EVO",
    );
  });

  it("falls back to just the name when the brand is missing", () => {
    expect(gearItemLabel({ name: "Rental drysuit" })).toBe("Rental drysuit");
    expect(gearItemLabel({ name: "Rental drysuit", brand: null })).toBe(
      "Rental drysuit",
    );
    // "" is what a cleared brand field holds before it's normalized to null.
    expect(gearItemLabel({ name: "Rental drysuit", brand: "" })).toBe(
      "Rental drysuit",
    );
  });
});

describe("gearTypeLabel", () => {
  it("labels every type in the vocabulary", () => {
    // Guards against a type being added to GEAR_TYPES without a label, which
    // would otherwise only show up as a raw slug in the UI.
    for (const type of GEAR_TYPES) {
      const label = gearTypeLabel(type);
      expect(label, `missing label for "${type}"`).toBeTruthy();
      expect(label).not.toBe(type);
    }
  });

  it("spells out acronyms and multi-word labels", () => {
    expect(gearTypeLabel("bcd")).toBe("BCD");
    expect(gearTypeLabel("smb")).toBe("SMB");
    expect(gearTypeLabel("computer")).toBe("Dive computer");
  });

  it("returns null when there is no type", () => {
    expect(gearTypeLabel(null)).toBeNull();
    expect(gearTypeLabel(undefined)).toBeNull();
    expect(gearTypeLabel("")).toBeNull();
  });

  it("falls back to the raw value for a type this build doesn't know", () => {
    // The API may grow a category before the frontend does; a blank cell would
    // be worse than showing the slug.
    expect(gearTypeLabel("rebreather")).toBe("rebreather");
  });
});
