import { z } from "zod";
import { maxLength, optionalEmailField, phoneField } from "./fields";
import { notesField } from "./notes";
import { requiredName } from "./name";
import { coordinateField, isSet } from "./coordinates";
import type { ContactAddress } from "@/lib/api/contacts";

// The API's bounds for a contact (`schemas/contact.py`), which are DiveJSON's.
const NAME_MAX = 255;
const WEBSITE_MAX = 512;
const ADDRESS_LINE_MAX = 255;
const POSTCODE_MAX = 32;

/**
 * A website as the API stores it: an absolute URL. A bare host - what a diver
 * copies off a sign - gets `https://` in front, since the API refuses one without
 * a scheme rather than guessing; anything already carrying `scheme://` is left as
 * typed, so an `ftp://` is refused beside the field instead of rewritten. `null`
 * for an empty box.
 */
export function normalizeWebsite(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

// The API's `check_website`: an http or https scheme and a host. Checked on what
// will be sent, not on what was typed.
function isWebsite(value: string | undefined): boolean {
  const website = normalizeWebsite(value);
  if (website === null) return true;
  if (website.length > WEBSITE_MAX) return false;
  try {
    const url = new URL(website);
    return (
      (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname
    );
  } catch {
    return false;
  }
}

// Every part `""` when unset, like the form's other text fields, so the group can
// be edited one box at a time; `contactAddressFromForm` is what turns it back into
// the API's shape.
const addressSchema = z.object({
  street: maxLength("Address", ADDRESS_LINE_MAX),
  city: maxLength("City", ADDRESS_LINE_MAX),
  postcode: maxLength("Postcode", POSTCODE_MAX),
  region: maxLength("Region", ADDRESS_LINE_MAX),
  country: maxLength("Country", ADDRESS_LINE_MAX),
});

export type ContactAddressInput = z.input<typeof addressSchema>;

export const EMPTY_CONTACT_ADDRESS: ContactAddressInput = {
  street: "",
  city: "",
  postcode: "",
  region: "",
  country: "",
};

/** Whether any part of the address holds text. */
function hasAddress(address: ContactAddressInput): boolean {
  return Object.values(address).some((part) => part.trim() !== "");
}

// One schema for both creating and editing: `ContactDialog` is the only form for
// either and always shows every field, so an update never sends a partial object.
// Every conversion - the website's scheme, `""` to `null`, the address to `null` -
// happens in plain helpers before the request rather than here, which keeps
// `z.input<>` and the form's own types the same (CONTRIBUTING.md).
export const contactSchema = z
  .object({
    name: requiredName("Name", NAME_MAX),
    // Strings rather than the vocabulary's enum, so an edit keeps a role this
    // build has no checkbox for - see `ContactCreate.roles`.
    roles: z.array(z.string()),
    phone: phoneField(),
    email: optionalEmailField(),
    website: z.string(),
    address: addressSchema,
    // Strings, converted at submit by `parseFormCoordinate`, for the reason the
    // dive site form's are.
    latitude: coordinateField(90, "Latitude", "27.8506"),
    longitude: coordinateField(180, "Longitude", "34.3136"),
    notes: notesField(),
  })
  .refine((data) => isWebsite(data.website), {
    message: "Use a web address, e.g. blueocean.com",
    path: ["website"],
  })
  // The one part an address cannot go without - in the API, in DiveJSON and in
  // UDDF alike - and only once there is an address: an empty group is no address
  // at all, and needs no country.
  .refine(
    (data) => !hasAddress(data.address) || data.address.country.trim() !== "",
    {
      message: "An address needs its country",
      path: ["address", "country"],
    },
  )
  // Both-or-neither, as the API refuses half a pair; the message lands on the
  // half that is missing.
  .refine((data) => !isSet(data.longitude) || isSet(data.latitude), {
    message: "Latitude is required when longitude is given",
    path: ["latitude"],
  })
  .refine((data) => !isSet(data.latitude) || isSet(data.longitude), {
    message: "Longitude is required when latitude is given",
    path: ["longitude"],
  });

export type ContactInput = z.input<typeof contactSchema>;

/**
 * The form's address group as the API takes it: `null` when every box is empty,
 * and otherwise each part trimmed, an empty one sent as `null` - naming `address`
 * replaces the stored one whole, so a part left out would be cleared anyway.
 */
export function contactAddressFromForm(
  address: ContactAddressInput,
): ContactAddress | null {
  if (!hasAddress(address)) return null;
  const part = (value: string) => value.trim() || null;
  return {
    street: part(address.street),
    city: part(address.city),
    postcode: part(address.postcode),
    region: part(address.region),
    country: address.country.trim(),
  };
}

/** A stored address as the form's group holds it. */
export function contactAddressToForm(
  address: ContactAddress | null | undefined,
): ContactAddressInput {
  return {
    street: address?.street ?? "",
    city: address?.city ?? "",
    postcode: address?.postcode ?? "",
    region: address?.region ?? "",
    country: address?.country ?? "",
  };
}
