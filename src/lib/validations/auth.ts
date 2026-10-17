import { z } from "zod";
import { emailField } from "./fields";
import { USER_FIELD_SCHEMAS } from "./user-fields";

// The single "how do I get in?" form - just an email address, no password. See
// `components/auth/auth-form.tsx`.
export const emailAuthSchema = z.object({
  email: emailField(),
});

// Profile completion (`components/auth/profile-completion-form.tsx`) - shown once for
// a verified identity (email or Google) with no existing account. No password field:
// identity was already proven by the email-magic-link or Google flow.
export const profileCompletionSchema = z.object(USER_FIELD_SCHEMAS);

export type EmailAuthFormData = z.infer<typeof emailAuthSchema>;
export type ProfileCompletionFormData = z.infer<typeof profileCompletionSchema>;
