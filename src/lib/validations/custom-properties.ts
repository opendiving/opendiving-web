import { z } from "zod";
import {
  CUSTOM_PROPERTIES_MAX,
  CUSTOM_PROPERTY_KEY_MAX,
  CUSTOM_PROPERTY_VALUE_MAX,
  customPropertyKey,
} from "@/lib/custom-properties";
import { maxLengthMessage } from "./fields";

/**
 * A record's custom properties as a form holds them: the rows as typed, which
 * `normalizeCustomProperties` trims before the request. A refine rather than a
 * `.transform()`, so `z.input<>` stays the form's own type (CONTRIBUTING.md). A
 * row blank on both sides passes - it is dropped on the way out - and one with
 * only a key or only a value is the diver's to finish or remove.
 */
export const customPropertiesField = () =>
  z
    .array(
      z.object({
        key: z
          .string()
          .max(
            CUSTOM_PROPERTY_KEY_MAX,
            maxLengthMessage("A key", CUSTOM_PROPERTY_KEY_MAX),
          ),
        value: z
          .string()
          .max(
            CUSTOM_PROPERTY_VALUE_MAX,
            maxLengthMessage("A value", CUSTOM_PROPERTY_VALUE_MAX),
          ),
      }),
    )
    .superRefine((rows, ctx) => {
      const seen = new Set<string>();
      let filled = 0;
      rows.forEach((row, index) => {
        const key = row.key.trim();
        const value = row.value.trim();
        if (!key && !value) return;
        filled += 1;
        if (!key) {
          ctx.addIssue({
            code: "custom",
            message: "Give this value a key",
            path: [index, "key"],
          });
        }
        if (!value) {
          ctx.addIssue({
            code: "custom",
            message: "Give this key a value",
            path: [index, "value"],
          });
        }
        if (key) {
          const folded = customPropertyKey(key);
          if (seen.has(folded)) {
            ctx.addIssue({
              code: "custom",
              message: "This key is already used above",
              path: [index, "key"],
            });
          }
          seen.add(folded);
        }
      });
      if (filled > CUSTOM_PROPERTIES_MAX) {
        ctx.addIssue({
          code: "custom",
          message: `A record holds at most ${CUSTOM_PROPERTIES_MAX} custom properties`,
          path: [],
        });
      }
    });

export type CustomPropertiesInput = z.input<
  ReturnType<typeof customPropertiesField>
>;
