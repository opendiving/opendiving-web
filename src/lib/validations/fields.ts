import { z } from "zod";

/** The one spelling of a length limit, for a check `.max()` cannot express. */
export const maxLengthMessage = (label: string, max: number) =>
  `${label} cannot exceed ${max.toLocaleString("en-US")} characters`;

/** A string bounded where the API bounds it. */
export const maxLength = (label: string, max: number) =>
  z.string().max(max, maxLengthMessage(label, max));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = "Use a valid date";

/** A bare `YYYY-MM-DD` the diver has to give. */
export const dateField = (requiredMessage: string) =>
  z.string().min(1, requiredMessage).regex(ISO_DATE, DATE_MESSAGE);

/**
 * A bare `YYYY-MM-DD` that may be blank. `""` is what a cleared date input holds, and
 * a union rather than a `.transform()` keeps `z.input<>` the form's own type - see
 * "Never use `z.preprocess()`/`.transform()`" in DECISIONS.md.
 */
export const optionalDateField = () =>
  z.union([z.literal(""), z.string().regex(ISO_DATE, DATE_MESSAGE)]);

// The API's bounds, which are DiveJSON's wherever a record carries one.
const EMAIL_MAX = 255;
const PHONE_MAX = 32;
const EMAIL_MESSAGE = "Please enter a valid email address";

/** An address the form cannot go without. */
export const emailField = () => z.email(EMAIL_MESSAGE);

/**
 * An address that may be blank, checked as it will be sent: trimmed, which the
 * submit does too.
 */
export const optionalEmailField = () =>
  maxLength("Email", EMAIL_MAX).refine(
    (value) => !value.trim() || z.email().safeParse(value.trim()).success,
    EMAIL_MESSAGE,
  );

/** A phone number, free text, which may be blank. */
export const phoneField = (label = "Phone") => maxLength(label, PHONE_MAX);
