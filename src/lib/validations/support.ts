import { z } from "zod";
import { emailField, maxLength } from "./fields";
import { SUPPORT_CATEGORIES } from "@/lib/api/support";

// Mirrors the API's `SupportRequest` (see `schemas/support.py`) field for
// field, including the length bounds - the server rejects anything outside them with
// a 422, and a form that only finds that out after a round-trip is a worse form.
export const supportSchema = z.object({
  name: maxLength("Name", 100).min(1, "Please tell us who you are"),
  email: emailField(),
  category: z.enum(SUPPORT_CATEGORIES),
  subject: maxLength("Subject", 150).min(
    3,
    "Subject must be at least 3 characters",
  ),
  message: maxLength("Message", 5000).min(
    10,
    "Please add a little more detail",
  ),
});

export type SupportInput = z.input<typeof supportSchema>;
