import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import {
  DIVE_FORM_ALWAYS_ON_FIELDS,
  DIVE_FORM_FIELDS,
  DIVE_FORM_FIELD_GROUPS,
  DIVE_FORM_FIELD_REGISTRY,
  EMPTY_DIVE_FORM_VALUES,
  MIXTURE_FIELD_PREFIX,
  NON_HIDEABLE_MIXTURE_SCHEMA_KEYS,
  canonicalHiddenFields,
  diveFormFieldsWithErrors,
  hiddenFieldsEqual,
  isNonEmptyFieldValue,
  nonEmptyDiveFormFields,
} from "./dive-form-fields";
import { diveCreateSchema, diveMixtureSchema } from "./validations/dive";

// Optionality is measured, not read off `.optional()`: `start_time` and `duration`
// are built by helpers, and a `.default()` accepts `undefined` too. `safeParse` is
// the only question that gets all of those right.
const acceptsUndefined = (schema: ZodType) =>
  schema.safeParse(undefined).success;

const optionalKeysOf = (shape: Record<string, ZodType>) =>
  Object.keys(shape).filter((key) => acceptsUndefined(shape[key]));

describe("the vocabulary is the form's own optional fields", () => {
  // The web half of the two-sided guard the API's `DiveFormField` docstring names.
  // Its half is a *subset* check - API-optional is wider than form-optional - and
  // this one is an equality check, so between them the mirror is pinned from both
  // ends with no cross-repo test.
  //
  // What this fails on is the case worth failing on: a new optional input added to
  // the dive form and not registered here. It cannot be hidden, it has no row in the
  // Fields dialog, and nothing else in the suite would notice.

  it("holds every optional top-level field of the create schema, and no others", () => {
    const optional = optionalKeysOf(
      diveCreateSchema.shape as unknown as Record<string, ZodType>,
    );
    const registered = DIVE_FORM_FIELDS.filter(
      (key) => !key.startsWith(MIXTURE_FIELD_PREFIX),
    );

    expect([...registered].sort()).toEqual([...optional].sort());
  });

  it("holds every optional cylinder field except the ones exempt by name", () => {
    const optional = optionalKeysOf(
      diveMixtureSchema.shape as unknown as Record<string, ZodType>,
    ).filter(
      (key) =>
        !(NON_HIDEABLE_MIXTURE_SCHEMA_KEYS as readonly string[]).includes(key),
    );
    const registered = DIVE_FORM_FIELDS.filter((key) =>
      key.startsWith(MIXTURE_FIELD_PREFIX),
    ).map((key) => key.slice(MIXTURE_FIELD_PREFIX.length));

    expect([...registered].sort()).toEqual([...optional].sort());
  });

  it("exempts only cylinder fields that are actually optional", () => {
    // The exemption list is a claim about the schema as well as a decision about the
    // product: a name that stopped being an optional key of `diveMixtureSchema` -
    // renamed, removed, or made required again - would sit here excluding nothing
    // while the equality check above went on passing.
    const shape = diveMixtureSchema.shape as unknown as Record<string, ZodType>;
    for (const key of NON_HIDEABLE_MIXTURE_SCHEMA_KEYS) {
      expect(shape[key], `${key} is no longer a mixture field`).toBeDefined();
      expect(acceptsUndefined(shape[key]), `${key} is required now`).toBe(true);
    }
  });

  it("requires exactly the three top-level fields the panel calls always shown", () => {
    const required = Object.keys(
      diveCreateSchema.shape as unknown as Record<string, ZodType>,
    ).filter(
      (key) =>
        !acceptsUndefined(
          (diveCreateSchema.shape as unknown as Record<string, ZodType>)[key],
        ),
    );

    expect(required.sort()).toEqual(["dive_number", "duration", "start_time"]);
  });
});

describe("the panel's registry", () => {
  it("carries one entry per key, in the vocabulary's own order", () => {
    expect(DIVE_FORM_FIELD_REGISTRY.map((entry) => entry.key)).toEqual([
      ...DIVE_FORM_FIELDS,
    ]);
  });

  it("labels every key, and gives each a group the panel renders", () => {
    for (const entry of DIVE_FORM_FIELD_REGISTRY) {
      expect(entry.label.length, entry.key).toBeGreaterThan(0);
      expect(DIVE_FORM_FIELD_GROUPS).toContain(entry.group);
    }
    for (const entry of DIVE_FORM_ALWAYS_ON_FIELDS) {
      expect(DIVE_FORM_FIELD_GROUPS).toContain(entry.group);
    }
  });

  it("gives every group at least one row", () => {
    // A group with nothing in it would render an empty heading. "Date and time" is
    // the one carried only by its always-on rows, which is why both lists count.
    for (const group of DIVE_FORM_FIELD_GROUPS) {
      const rows =
        DIVE_FORM_FIELD_REGISTRY.filter((entry) => entry.group === group)
          .length +
        DIVE_FORM_ALWAYS_ON_FIELDS.filter((entry) => entry.group === group)
          .length;
      expect(rows, group).toBeGreaterThan(0);
    }
  });

  it("gives every key an empty value", () => {
    for (const key of DIVE_FORM_FIELDS) {
      expect(EMPTY_DIVE_FORM_VALUES).toHaveProperty(key);
      expect(isNonEmptyFieldValue(EMPTY_DIVE_FORM_VALUES[key]), key).toBe(
        false,
      );
    }
  });
});

describe("canonicalHiddenFields", () => {
  it("collapses duplicates and imposes form order", () => {
    expect(
      canonicalHiddenFields([
        "notes",
        "altitude",
        "notes",
        "mixture.role",
        "trip_uuid",
      ]),
    ).toEqual(["trip_uuid", "altitude", "notes", "mixture.role"]);
  });

  it("makes set equality a list comparison", () => {
    expect(
      hiddenFieldsEqual(["notes", "altitude"], ["altitude", "notes"]),
    ).toBe(true);
    expect(hiddenFieldsEqual(["notes"], ["notes", "altitude"])).toBe(false);
    expect(hiddenFieldsEqual([], [])).toBe(true);
  });
});

describe("what counts as a value having arrived", () => {
  it("treats undefined, null, empty string and empty array as nothing", () => {
    expect(
      nonEmptyDiveFormFields({
        trip_uuid: null,
        course_uuid: undefined,
        notes: "",
        dive_site_uuids: [],
        mixtures: [],
      }),
    ).toEqual([]);
  });

  it("treats 0 as a value", () => {
    // An end pressure of 0 is a drained cylinder, not a missing reading - the
    // asymmetry `diveMixtureSchema` spells out at length.
    expect(nonEmptyDiveFormFields({ mixtures: [{ end_pressure: 0 }] })).toEqual(
      ["mixtures", "mixture.end_pressure"],
    );
  });

  it("reveals a cylinder column any tank holds a value in", () => {
    expect(
      nonEmptyDiveFormFields({
        mixtures: [
          { start_pressure: "", role: "" },
          { start_pressure: 210, role: "" },
        ],
      }),
    ).toEqual(["mixtures", "mixture.start_pressure"]);
  });

  it("returns the keys in form order", () => {
    expect(
      nonEmptyDiveFormFields({ notes: "wreck", trip_uuid: "trip-1" }),
    ).toEqual(["trip_uuid", "notes"]);
  });
});

describe("the keys a failed submit puts back on screen", () => {
  it("names the top-level fields carrying an error", () => {
    expect(
      diveFormFieldsWithErrors({
        altitude: { message: "out of range" },
        duration: { message: "required" },
      }),
    ).toEqual(["altitude"]);
  });

  it("reveals the gas section as well as the column, for a per-cylinder error", () => {
    // The message has nowhere to render while the section is off screen, so
    // revealing the column alone would leave the save button doing nothing.
    expect(
      diveFormFieldsWithErrors({
        mixtures: [undefined, { end_pressure: { message: "too high" } }],
      }),
    ).toEqual(["mixtures", "mixture.end_pressure"]);
  });

  it("says nothing when the errors are all on always-on fields", () => {
    expect(diveFormFieldsWithErrors({ dive_number: { message: "x" } })).toEqual(
      [],
    );
  });
});
