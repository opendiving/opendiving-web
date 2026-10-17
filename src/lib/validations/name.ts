import { z } from "zod";

/**
 * A record's required name, checked on what will be sent: every dialog trims the
 * name on submit, so a name of spaces alone is none and the bound applies to the
 * trimmed text.
 */
export const requiredName = (label: string, max: number) =>
  z
    .string()
    .refine((value) => value.trim() !== "", `${label} is required`)
    .refine(
      (value) => value.trim().length <= max,
      `${label} cannot exceed ${max} characters`,
    );
