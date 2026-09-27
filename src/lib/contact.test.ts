import { describe, expect, it } from "vitest";
import {
  distinctContactUuids,
  formatContactAddress,
  formatContactPlace,
  formatWebsite,
} from "./contact";

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

describe("formatWebsite", () => {
  it("drops the scheme and a bare trailing slash, as a sign prints it", () => {
    expect(formatWebsite("https://blueocean.example/")).toBe(
      "blueocean.example",
    );
    expect(formatWebsite("http://blueocean.example/dahab?lang=en")).toBe(
      "blueocean.example/dahab?lang=en",
    );
  });

  it("shows text it cannot parse as it is", () => {
    expect(formatWebsite("blueocean")).toBe("blueocean");
  });
});

describe("distinctContactUuids", () => {
  it("names each contact once, in the order the records first name it", () => {
    // A trip's dives as the trip lists them: two shops, one of them twice, and
    // a dive that names neither.
    expect(
      distinctContactUuids([
        { contact_uuid: "red" },
        { contact_uuid: null },
        { contact_uuid: "blue" },
        { contact_uuid: "red" },
        {},
      ]),
    ).toEqual(["red", "blue"]);
  });
});
