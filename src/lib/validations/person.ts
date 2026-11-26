import { z } from "zod";
import { customPropertiesField } from "./custom-properties";
import { optionalEmailField, phoneField } from "./fields";

import { notesField } from "./notes";
import { requiredName } from "./name";

// The API's bound for a person's name (`schemas/person.py`), which is DiveJSON's.
const NAME_MAX = 255;

// One schema for both creating and editing: `PersonDialog` is the only form for
// either. The `""`-to-`null` conversions happen in the dialog before the request
// rather than here, which keeps `z.input<>` and the form's own types the same
// (CONTRIBUTING.md).
export const personSchema = z.object({
  name: requiredName("Name", NAME_MAX),
  email: optionalEmailField(),
  phone: phoneField(),
  notes: notesField(),
  custom_properties: customPropertiesField(),
});

export type PersonInput = z.input<typeof personSchema>;

/**
 * One person on a dive, a trip or a course, as a form holds it - the wire shape
 * exactly, so it goes out as it is. `role` is a string for the reason
 * `PersonReference.role` is, and `null` means "was there".
 */
export const personReferenceSchema = z.object({
  person_uuid: z.string(),
  role: z.string().nullable(),
});
