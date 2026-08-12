import { z } from "zod";

// The single "how do I get in?" form - just an email address, no password. See
// `components/auth/auth-form.tsx`.
export const emailAuthSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

// Profile completion (`components/auth/profile-completion-form.tsx`) - shown once for
// a verified identity (email or Google) with no existing account. No password field:
// identity was already proven by the email-magic-link or Google flow.
export const profileCompletionSchema = z.object({
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

export type EmailAuthFormData = z.infer<typeof emailAuthSchema>;
export type ProfileCompletionFormData = z.infer<typeof profileCompletionSchema>;
