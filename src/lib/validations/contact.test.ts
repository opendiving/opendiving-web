import { describe, expect, it } from "vitest";
import {
  contactAddressFromForm,
  contactAddressToForm,
  contactSchema,
  EMPTY_CONTACT_ADDRESS,
  normalizeWebsite,
  type ContactInput,
} from "./contact";

const valid: ContactInput = {
  name: "Blue Ocean",
  roles: ["dive_center"],
  phone: "",
  email: "",
  website: "",
  address: EMPTY_CONTACT_ADDRESS,
  notes: "",
};

const errorPaths = (input: ContactInput) => {
  const result = contactSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join("."));
};

describe("normalizeWebsite", () => {
  it("gives a bare host the scheme the API requires", () => {
    // What a diver copies off a sign; the API refuses it without a scheme.
    expect(normalizeWebsite("blueocean.com")).toBe("https://blueocean.com");
    expect(normalizeWebsite("  www.blueocean.com/dahab ")).toBe(
      "https://www.blueocean.com/dahab",
    );
  });

  it("leaves a URL that already names its scheme as typed", () => {
    expect(normalizeWebsite("http://blueocean.com")).toBe(
      "http://blueocean.com",
    );
    expect(normalizeWebsite("ftp://blueocean.com")).toBe("ftp://blueocean.com");
  });

  it("reads an empty box as no website", () => {
    expect(normalizeWebsite("")).toBeNull();
    expect(normalizeWebsite("   ")).toBeNull();
    expect(normalizeWebsite(undefined)).toBeNull();
  });
});

describe("contactSchema", () => {
  it("accepts a name and nothing else", () => {
    expect(errorPaths({ ...valid, roles: [] })).toEqual([]);
  });

  it("accepts a bare host, which is sent with its scheme", () => {
    expect(errorPaths({ ...valid, website: "blueocean.com" })).toEqual([]);
  });

  it("refuses a website the API would refuse, beside the field", () => {
    expect(errorPaths({ ...valid, website: "ftp://blueocean.com" })).toEqual([
      "website",
    ]);
    expect(errorPaths({ ...valid, website: "not a url" })).toEqual(["website"]);
  });

  it("refuses a website longer than the API stores, scheme included", () => {
    // 504 characters typed, 512 once `https://` is added: the API's own limit.
    const typed = `blueocean.com/${"a".repeat(490)}`;
    expect(errorPaths({ ...valid, website: typed })).toEqual([]);
    expect(errorPaths({ ...valid, website: `${typed}a` })).toEqual(["website"]);
  });

  it("refuses an email the API would", () => {
    expect(errorPaths({ ...valid, email: "not-an-email" })).toEqual(["email"]);
    expect(errorPaths({ ...valid, email: "info@blueocean.com" })).toEqual([]);
  });

  it("needs a country only once the address holds something", () => {
    // An empty group is no address at all; a city with no country is one the
    // API, DiveJSON and UDDF all refuse.
    expect(errorPaths(valid)).toEqual([]);
    expect(
      errorPaths({
        ...valid,
        address: { ...EMPTY_CONTACT_ADDRESS, city: "Dahab" },
      }),
    ).toEqual(["address.country"]);
    expect(
      errorPaths({
        ...valid,
        address: { ...EMPTY_CONTACT_ADDRESS, city: "Dahab", country: " " },
      }),
    ).toEqual(["address.country"]);
    expect(
      errorPaths({
        ...valid,
        address: { ...EMPTY_CONTACT_ADDRESS, city: "Dahab", country: "Egypt" },
      }),
    ).toEqual([]);
  });

  it("mirrors the API's lengths", () => {
    expect(errorPaths({ ...valid, name: "a".repeat(256) })).toEqual(["name"]);
    expect(errorPaths({ ...valid, phone: "1".repeat(33) })).toEqual(["phone"]);
    expect(
      errorPaths({
        ...valid,
        address: {
          ...EMPTY_CONTACT_ADDRESS,
          postcode: "1".repeat(33),
          country: "Egypt",
        },
      }),
    ).toEqual(["address.postcode"]);
  });
});

describe("the address group", () => {
  it("sends no address for an empty group", () => {
    expect(contactAddressFromForm(EMPTY_CONTACT_ADDRESS)).toBeNull();
    expect(
      contactAddressFromForm({ ...EMPTY_CONTACT_ADDRESS, street: "  " }),
    ).toBeNull();
  });

  it("sends every part, an empty one as null, since the address is replaced whole", () => {
    expect(
      contactAddressFromForm({
        ...EMPTY_CONTACT_ADDRESS,
        city: " Dahab ",
        country: "Egypt ",
      }),
    ).toEqual({
      street: null,
      city: "Dahab",
      postcode: null,
      region: null,
      country: "Egypt",
    });
  });

  it("reads a stored address back into the group, and no address as an empty one", () => {
    expect(contactAddressToForm(null)).toEqual(EMPTY_CONTACT_ADDRESS);
    expect(
      contactAddressToForm({ city: "Dahab", region: null, country: "Egypt" }),
    ).toEqual({ ...EMPTY_CONTACT_ADDRESS, city: "Dahab", country: "Egypt" });
  });
});
