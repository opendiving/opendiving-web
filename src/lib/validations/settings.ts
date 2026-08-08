import { z } from "zod";

// Note: no `email` field here - changing an account's email requires confirming
// ownership of the new address first (see `emailChangeSchema` below, and
// `authAPI.requestEmailChange`/`verifyEmailChange`), not a plain field edit.
export const profileSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(30, "Name must not exceed 30 characters"),
  username: z
    .string()
    .min(2, "Username must be at least 2 characters")
    .max(20, "Username must not exceed 20 characters")
    .regex(
      /^[a-z0-9]+$/,
      "Username can only contain lowercase letters and numbers",
    ),
});

export const emailChangeSchema = z.object({
  newEmail: z.string().email("Please enter a valid email address"),
});

export type ProfileFormData = z.infer<typeof profileSchema>;
export type EmailChangeFormData = z.infer<typeof emailChangeSchema>;
