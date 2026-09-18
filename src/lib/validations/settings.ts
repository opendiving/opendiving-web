import { z } from "zod";

// The account's email, which is not an ordinary field: changing it requires
// confirming ownership of the new address first (`authAPI.requestEmailChange` /
// `verifyEmailChange`), so it has a card and a flow of its own rather than a box on
// a form. Every field that *is* ordinary lives in `validations/user-fields.ts`, which
// is the one place their bounds and messages are written.
export const emailChangeSchema = z.object({
  newEmail: z.string().email("Please enter a valid email address"),
});

export type EmailChangeFormData = z.infer<typeof emailChangeSchema>;
