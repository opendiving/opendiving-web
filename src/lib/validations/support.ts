import { z } from "zod";
import { SUPPORT_CATEGORIES } from "@/lib/api/support";

// Mirrors the API's `SupportRequest` (see `schemas/support.py`) field for
// field, including the length bounds - the server rejects anything outside them with
// a 422, and a form that only finds that out after a round-trip is a worse form.
export const supportSchema = z.object({
  name: z
    .string()
    .min(1, "Please tell us who you are")
    .max(100, "Name cannot exceed 100 characters"),
  email: z.string().email("Please enter a valid email address"),
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z
    .string()
    .min(3, "Subject must be at least 3 characters")
    .max(150, "Subject cannot exceed 150 characters"),
  message: z
    .string()
    .min(10, "Please add a little more detail")
    .max(5000, "Message cannot exceed 5000 characters"),
});

export type SupportInput = z.input<typeof supportSchema>;
