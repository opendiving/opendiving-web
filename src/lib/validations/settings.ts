import { z } from "zod";

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
  email: z.string().email("Please enter a valid email address"),
});

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/^.*[0-9].*$/, "Password must contain at least one number")
      .regex(
        /^.*[A-Z].*$/,
        "Password must contain at least one uppercase letter",
      )
      .regex(
        /^.*[a-z].*$/,
        "Password must contain at least one lowercase letter",
      )
      .regex(
        /^.*[^a-zA-Z0-9].*$/,
        "Password must contain at least one special character",
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export type ProfileFormData = z.infer<typeof profileSchema>;
export type PasswordFormData = z.infer<typeof passwordSchema>;
