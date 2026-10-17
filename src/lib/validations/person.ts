import { z } from "zod";
import { maxLengthMessage, optionalEmailField, phoneField } from "./fields";
import { notesField } from "./notes";

// The API's bounds for a person (`schemas/person.py`), which are DiveJSON's, and
// a username's own: nothing longer names an account.
const NAME_MAX = 255;
const USERNAME_MAX = 20;

/**
 * A username as the API is asked for it: trimmed, and without the `@` a diver
 * copies off the pickers, which print a linked account as `@alexm`. `null` for
 * an empty box, which on an edit is what unlinks the person.
 */
export function normalizeLinkedUsername(value: string): string | null {
  const username = value.trim().replace(/^@/, "").trim();
  return username || null;
}

// One schema for both creating and editing: `PersonDialog` is the only form for
// either and always shows every field. The username's `@` and the `""`-to-`null`
// conversions happen in plain helpers before the request rather than here, which
// keeps `z.input<>` and the form's own types the same (CONTRIBUTING.md).
export const personSchema = z
  .object({
    // Checked on what will be sent: the API stores a name trimmed, and a name of
    // spaces alone is none.
    name: z
      .string()
      .refine((value) => value.trim() !== "", "Name is required")
      .refine(
        (value) => value.trim().length <= NAME_MAX,
        maxLengthMessage("Name", NAME_MAX),
      ),
    username: z.string(),
    email: optionalEmailField(),
    phone: phoneField(),
    notes: notesField(),
  })
  .refine(
    (data) =>
      (normalizeLinkedUsername(data.username) ?? "").length <= USERNAME_MAX,
    {
      message: maxLengthMessage("Username", USERNAME_MAX),
      path: ["username"],
    },
  );

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
