import { describe, expect, it } from "vitest";
import { formatContactAddress, formatContactPlace } from "./contact";

describe("formatContactAddress", () => {
  it("writes the parts in postal order, leaving out the empty ones", () => {
    expect(
      formatContactAddress({
        street: "Mashraba",
        city: "Dahab",
        postcode: null,
        region: " ",
        country: "Egypt",
      }),
    ).toBe("Mashraba, Dahab, Egypt");
  });

  it("answers nothing for no address, or one with nothing in it", () => {
    expect(formatContactAddress(null)).toBeUndefined();
    expect(
      formatContactAddress({
        street: "",
        city: "",
        postcode: "",
        region: "",
        country: "",
      }),
    ).toBeUndefined();
  });
});

describe("formatContactPlace", () => {
  it("names the city and the country, either one alone when that is all there is", () => {
    const address = {
      street: "Mashraba",
      city: "Dahab",
      postcode: "46617",
      region: "South Sinai",
      country: "Egypt",
    };
    expect(formatContactPlace(address)).toBe("Dahab, Egypt");
    expect(formatContactPlace({ ...address, city: null })).toBe("Egypt");
    expect(formatContactPlace({ ...address, country: " " })).toBe("Dahab");
  });

  it("answers nothing for no address, or one with neither", () => {
    expect(formatContactPlace(null)).toBeUndefined();
    expect(
      formatContactPlace({ street: "Mashraba", city: "", country: "" }),
    ).toBeUndefined();
  });
});
