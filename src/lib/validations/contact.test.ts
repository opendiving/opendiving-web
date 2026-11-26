import { describe, expect, it } from "vitest";
import {
  contactAddressFromForm,
  contactAddressToForm,
  contactSchema,
  EMPTY_CONTACT_ADDRESS,
  type ContactInput,
} from "./contact";

const valid: ContactInput = {
  name: "Blue Ocean",
  roles: ["dive_center"],
  phone: "",
  email: "",
  links: [],
  address: EMPTY_CONTACT_ADDRESS,
  notes: "",
};

const errorPaths = (input: ContactInput) => {
  const result = contactSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join("."));
};

describe("contactSchema", () => {
  it("accepts a name and nothing else", () => {
    expect(errorPaths({ ...valid, roles: [] })).toEqual([]);
  });

  it("refuses a link the API would refuse, on its row", () => {
    expect(
      errorPaths({
        ...valid,
        links: [
          { url: "blueocean.com", label: "" },
          { url: "ftp://blueocean.com", label: "" },
        ],
      }),
    ).toEqual(["links.1.url"]);
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
