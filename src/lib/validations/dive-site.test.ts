import { describe, expect, it } from "vitest";
import {
  diveSiteFormSchema,
  formatCoordinateForForm,
  formatCoordinates,
  parseCoordinatePair,
  parseFormCoordinate,
} from "./dive-site";

describe("diveSiteFormSchema", () => {
  it("accepts a valid dive site with only the required name", () => {
    expect(diveSiteFormSchema.safeParse({ name: "Blue Hole" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(diveSiteFormSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    expect(diveSiteFormSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a name longer than 255 characters", () => {
    const result = diveSiteFormSchema.safeParse({ name: "a".repeat(256) });
    expect(result.success).toBe(false);
  });

  it("accepts optional location/notes", () => {
    const result = diveSiteFormSchema.safeParse({
      name: "Blue Hole",
      location: "Dahab, Egypt",
      notes: "Famous for its arch",
    });
    expect(result.success).toBe(true);
  });

  it("rejects notes longer than the max length", () => {
    const result = diveSiteFormSchema.safeParse({
      name: "Blue Hole",
      notes: "a".repeat(63207),
    });
    expect(result.success).toBe(false);
  });
});

describe("diveSiteFormSchema coordinates", () => {
  const site = (fields: Record<string, string>) => ({
    name: "Blue Hole",
    ...fields,
  });

  it("accepts a valid pair", () => {
    const result = diveSiteFormSchema.safeParse(
      site({ latitude: "28.5721", longitude: "34.5177" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts negative and integer coordinates", () => {
    const result = diveSiteFormSchema.safeParse(
      site({ latitude: "-16", longitude: "-145.5" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts both fields empty", () => {
    const result = diveSiteFormSchema.safeParse(
      site({ latitude: "", longitude: "" }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a latitude without a longitude", () => {
    const result = diveSiteFormSchema.safeParse(
      site({ latitude: "28.5721", longitude: "" }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["longitude"]);
  });

  it("rejects a longitude without a latitude", () => {
    const result = diveSiteFormSchema.safeParse(
      site({ latitude: "", longitude: "34.5177" }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["latitude"]);
  });

  it("rejects a latitude beyond 90", () => {
    const result = diveSiteFormSchema.safeParse(
      site({ latitude: "90.1", longitude: "34.5177" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a longitude beyond 180", () => {
    const result = diveSiteFormSchema.safeParse(
      site({ latitude: "28.5721", longitude: "-180.1" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric coordinate", () => {
    const result = diveSiteFormSchema.safeParse(
      site({ latitude: "28°34'N", longitude: "34.5177" }),
    );
    expect(result.success).toBe(false);
  });
});

describe("parseFormCoordinate", () => {
  it("parses a coordinate string to a number", () => {
    expect(parseFormCoordinate("28.5721")).toBe(28.5721);
    expect(parseFormCoordinate(" -16 ")).toBe(-16);
  });

  it("returns null for a cleared or missing field", () => {
    expect(parseFormCoordinate("")).toBeNull();
    expect(parseFormCoordinate("   ")).toBeNull();
    expect(parseFormCoordinate(undefined)).toBeNull();
  });

  it("keeps zero rather than treating it as empty", () => {
    expect(parseFormCoordinate("0")).toBe(0);
  });
});

describe("formatCoordinateForForm", () => {
  it("renders a coordinate without float noise", () => {
    expect(formatCoordinateForForm(27.8506)).toBe("27.8506");
    expect(formatCoordinateForForm(0)).toBe("0");
  });

  it("renders an absent coordinate as the empty string", () => {
    expect(formatCoordinateForForm(null)).toBe("");
    expect(formatCoordinateForForm(undefined)).toBe("");
  });

  // `String(5e-7)` is "5e-7", which the form's own regex rejects - a stored
  // value nobody typed would otherwise block every save of that site.
  it("renders sub-1e-6 coordinates in fixed notation, not exponent", () => {
    expect(formatCoordinateForForm(5e-7)).toBe("0.0000005");
    expect(formatCoordinateForForm(-5e-7)).toBe("-0.0000005");
    expect(formatCoordinateForForm(1.23e-7)).toBe("0.000000123");
  });

  // The property that matters: anything the API can hand back must load into
  // the form, pass the form's own validation, and parse back to the same
  // number - otherwise an untouched field blocks the save. Exact for any value
  // needing at most 20 decimal places, which covers every real coordinate.
  it("round-trips every formatted coordinate back through the schema", () => {
    const roundTrip = (value: number, field: "latitude" | "longitude") => {
      const formatted = formatCoordinateForForm(value);
      const result = diveSiteFormSchema.safeParse({
        name: "Blue Hole",
        latitude: field === "latitude" ? formatted : "0",
        longitude: field === "longitude" ? formatted : "0",
      });
      expect(result.success, `${value} formatted as "${formatted}"`).toBe(true);
      expect(parseFormCoordinate(formatted)).toBe(value);
    };

    for (const value of [27.8506, 0, -16.5, 90, -90, 5e-7, -5e-7, 1.23e-7]) {
      roundTrip(value, "latitude");
    }
    for (const value of [34.3136, -145, 180, -180]) {
      roundTrip(value, "longitude");
    }
  });
});

describe("formatCoordinates", () => {
  it("joins a pair", () => {
    expect(formatCoordinates(27.8506, 34.3136)).toBe("27.8506, 34.3136");
  });

  it("returns null unless both are present", () => {
    expect(formatCoordinates(null, null)).toBeNull();
    expect(formatCoordinates(27.8506, null)).toBeNull();
    expect(formatCoordinates(undefined, 34.3136)).toBeNull();
  });

  it("keeps a zero coordinate", () => {
    expect(formatCoordinates(0, 34.3136)).toBe("0, 34.3136");
  });

  it("displays sub-1e-6 coordinates in fixed notation too", () => {
    expect(formatCoordinates(5e-7, 34.3136)).toBe("0.0000005, 34.3136");
  });
});

describe("parseCoordinatePair", () => {
  it("splits the comma-separated form Google Maps copies", () => {
    expect(parseCoordinatePair("27.8506, 34.3136")).toEqual({
      latitude: "27.8506",
      longitude: "34.3136",
    });
  });

  it("accepts whitespace and semicolon separators and negatives", () => {
    expect(parseCoordinatePair("  -16.5   -145  ")).toEqual({
      latitude: "-16.5",
      longitude: "-145",
    });
    expect(parseCoordinatePair("27.8506;34.3136")).toEqual({
      latitude: "27.8506",
      longitude: "34.3136",
    });
  });

  it("returns null for anything that isn't a plain decimal pair", () => {
    expect(parseCoordinatePair("27.8506")).toBeNull();
    expect(parseCoordinatePair("27°51'02.2\"N 34°18'49.0\"E")).toBeNull();
    expect(parseCoordinatePair("1, 2, 3")).toBeNull();
    expect(parseCoordinatePair("")).toBeNull();
  });

  // "-16,5" is -16.5 across most of Europe. Splitting it into (-16, 5) puts a
  // Bali site in the Atlantic with everything in range and no error anywhere.
  it("refuses a bare comma between integers, which may be a decimal comma", () => {
    expect(parseCoordinatePair("-16,5")).toBeNull();
    expect(parseCoordinatePair("1,2")).toBeNull();
    expect(parseCoordinatePair("  -16,5  ")).toBeNull();
  });

  it("still splits pairs a decimal comma can't explain", () => {
    // A space after the comma: no one writes a decimal comma that way.
    expect(parseCoordinatePair("1, 2")).toEqual({
      latitude: "1",
      longitude: "2",
    });
    // A decimal point anywhere settles it, with or without a space.
    expect(parseCoordinatePair("27.8506,34.3136")).toEqual({
      latitude: "27.8506",
      longitude: "34.3136",
    });
  });
});
