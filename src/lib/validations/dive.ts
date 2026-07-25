import { z } from "zod";

const DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const dateTimeField = (message = "Start time must be in YYYY-MM-DD HH:mm:ss format") =>
  z
    .string()
    .min(1, "Start time is required")
    .regex(DATE_TIME_REGEX, message)
    .refine((val) => !Number.isNaN(new Date(val.replace(" ", "T")).getTime()), {
      message: "Start time must be a valid datetime",
    });

export const diveCreateSchema = z
  .object({
    dive_number: z
      .number()
      .int()
      .positive("Dive number must be a positive integer"),
    start_time: dateTimeField(),
    duration: z
      .number()
      .int("Duration must be an integer number of seconds")
      .positive("Duration must be positive"),
    max_depth: z.number().positive("Max depth must be positive").optional(),
    avg_depth: z.number().positive("Average depth must be positive").optional(),
    bottom_temperature: z
      .number()
      .int("Bottom temperature must be an integer")
      .optional(),
    visibility: z
      .number()
      .int("Visibility must be an integer")
      .positive("Visibility must be positive")
      .optional(),
    notes: z
      .string()
      .max(63206, "Notes cannot exceed 63206 characters")
      .default(""),
  });

export const diveUpdateSchema = z
  .object({
    dive_number: z
      .number()
      .int()
      .positive("Dive number must be a positive integer")
      .optional(),
    start_time: dateTimeField().optional(),
    duration: z
      .number()
      .int("Duration must be an integer number of seconds")
      .positive("Duration must be positive")
      .optional(),
    max_depth: z.number().positive("Max depth must be positive").optional(),
    avg_depth: z.number().positive("Average depth must be positive").optional(),
    bottom_temperature: z
      .number()
      .int("Bottom temperature must be an integer")
      .optional(),
    visibility: z
      .number()
      .int("Visibility must be an integer")
      .positive("Visibility must be positive")
      .optional(),
    notes: z
      .string()
      .max(63206, "Notes cannot exceed 63206 characters")
      .optional(),
  });

export type DiveCreateInput = z.input<typeof diveCreateSchema>;
export type DiveUpdateInput = z.input<typeof diveUpdateSchema>;
