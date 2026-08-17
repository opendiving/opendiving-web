import { z } from "zod";
import { parseFormDuration, parseUtcOffsetMinutes } from "@/lib/date-time";
import {
  GAS_ROLES,
  type DiveMixture,
  type DiveUpdate,
  type GasRole,
} from "@/lib/api/dives";

// Same offset-aware ISO 8601 shape as the API's `Dive.start_time`, e.g.
// "2021-04-04T10:04:47+02:00" - produced/consumed by `DiveStartTimeField`
// (`components/dives/dive-start-time-field.tsx`), so the form and the API
// always agree on a single `start_time` value with no separate offset field
// to keep in sync.
const dateTimeField = (
  message = "Start time must include a UTC offset, e.g. 2021-04-04T10:04:47+02:00",
) =>
  z
    .string()
    .min(1, "Start time is required")
    .refine((val) => parseUtcOffsetMinutes(val) !== null, { message })
    .refine((val) => !Number.isNaN(new Date(val).getTime()), {
      message: "Start time must be a valid datetime",
    });

// "MM:SS", e.g. "45:30" - minutes can be 1-3 digits, seconds must be two
// digits from 00-59. Converted to/from a plain seconds number right before
// hitting the API via `parseFormDuration()`/`formatDurationForForm()` in
// `lib/date-time.ts` - see `dateTimeField()` above for the same pattern.
const DURATION_REGEX = /^\d{1,3}:[0-5]\d$/;

const durationField = (
  message = "Duration must be in MM:SS format, e.g. 67:30",
) => z.string().min(1, "Duration is required").regex(DURATION_REGEX, message);

// Total ballast carried on the dive, in kilograms. Identical in the create and
// update schemas (it's optional in both), so it lives in one helper rather than
// being written out twice.
const weightField = () =>
  z.number().min(0, "Weight must be zero or positive").nullable().optional();

// Optional numeric field that can also hold the literal empty string "" while
// the user is editing. We deliberately never let the *live* form value become
// `undefined` for these fields: react-hook-form falls back to re-displaying a
// field's default value whenever its current value resolves to `undefined`,
// which made these fields appear to "reset" the moment they were cleared.
// Using "" as the empty state avoids that; callers are responsible for
// converting "" to `undefined` right before sending data to the API (see
// `normalizeMixtures` usage in the dive form pages).
export const diveMixtureSchema = z
  .object({
    id: z.number().optional(),
    volume: z.number().positive("Volume must be positive"),
    start_pressure: z
      .union([
        z.literal(""),
        z.number().positive("Start pressure must be positive"),
      ])
      .optional(),
    end_pressure: z
      .union([
        z.literal(""),
        z.number().min(0, "End pressure must be zero or positive"),
      ])
      .optional(),
    oxygen: z
      .number()
      .min(0, "Oxygen percentage must be at least 0")
      .max(100, "Oxygen percentage must be at most 100"),
    helium: z
      .number()
      .min(0, "Helium percentage must be at least 0")
      .max(100, "Helium percentage must be at most 100"),
    // Mirrors `ck_dive_mixture_po2_limit_range`. The band is wide because it exists to
    // catch a unit error rather than an aggressive gas plan - a Suunto JSON export
    // writes 140000 Pa for 1.4 bar - and it has to admit both real values a diver
    // types, 1.4 for a back gas and 1.6 for a deco bottle. `""` is the cleared state,
    // as it is for the pressures.
    po2_limit: z
      .union([
        z.literal(""),
        z
          .number()
          .min(0.4, "ppO₂ limit must be at least 0.4 bar")
          .max(2.0, "ppO₂ limit must be at most 2.0 bar"),
      ])
      .optional(),
    // Carried, never edited - there is no input for it. It is the file's own identifier
    // for the cylinder, so the form's job is to round-trip it untouched rather than let
    // it be retyped. `min(0)` mirrors `ck_dive_mixture_gas_number_non_negative`: a
    // Suunto Ocean numbers from 0.
    gas_number: z.number().int().min(0).optional(),
    // `""` for the same reason as the numeric fields above, not for symmetry: the
    // `<select>` has a real "Not recorded" option, and writing `undefined` when it is
    // chosen made react-hook-form re-display the imported role instead — clearing a
    // deco badge snapped it straight back. `normalizeMixtures` converts it away.
    role: z.union([z.literal(""), z.enum(GAS_ROLES)]).optional(),
  })
  .refine(
    (mixture) => {
      const start = mixture.start_pressure;
      const end = mixture.end_pressure;
      if (start === "" || start === undefined) return true;
      if (end === "" || end === undefined) return true;
      return end <= start;
    },
    {
      message: "End pressure cannot be greater than start pressure",
      path: ["end_pressure"],
    },
  )
  // A gas is oxygen, helium and whatever nitrogen is left over, so the two named
  // fractions cannot exceed the whole. Mirrors the API's
  // `ck_dive_mixture_oxygen_helium_sum`, and exists because without it the DB CHECK
  // was the *only* thing enforcing this: a 50/60 trimix passed the form, reached the
  // API and came back a 500, with the diver given nothing to act on.
  //
  // Reported on `helium` rather than `oxygen` because helium is the field being
  // filled in second on the trimix entries where this happens at all - putting the
  // message under the box the diver is looking at.
  .refine(
    (mixture) => {
      // Stay quiet when either fraction is already outside its own 0-100 range.
      // Zod runs this refinement alongside the per-field rules rather than
      // instead of them, so an oxygen of 150 otherwise draws *two* errors: the
      // accurate one on `oxygen`, and this one pointing at a helium box reading
      // 0. The range message names the field that actually has to change.
      const { oxygen, helium } = mixture;
      const inRange = (value: number) => value >= 0 && value <= 100;
      if (!inRange(oxygen) || !inRange(helium)) return true;

      return oxygen + helium <= 100;
    },
    {
      message: "Oxygen and helium together cannot exceed 100%",
      path: ["helium"],
    },
  );

export type DiveMixtureInput = z.input<typeof diveMixtureSchema>;

export interface NormalizedDiveMixture {
  volume: number;
  start_pressure?: number;
  end_pressure?: number;
  oxygen: number;
  helium: number;
  po2_limit?: number;
  gas_number?: number;
  role?: GasRole;
}

// Converts any "" placeholders (used to represent a cleared optional field
// while editing) into `undefined` before sending mixtures to the API. Also
// strips the client-side `id` field: the API replaces all of a dive's
// mixtures wholesale on every save (delete-all + re-insert) and its create
// schema doesn't accept an `id`, so echoing back an existing mixture's id
// would be rejected as an unexpected field.
//
// Fields are listed out explicitly (rather than spreading the input and
// overriding start_pressure/end_pressure) because TypeScript doesn't reliably
// narrow a spread-then-overridden property away from its original generic
// union type, which previously let the "" placeholder type leak into the
// inferred return type.
export function normalizeMixtures(
  mixtures: {
    id?: number;
    volume: number;
    start_pressure?: number | "";
    end_pressure?: number | "";
    oxygen: number;
    helium: number;
    po2_limit?: number | "";
    gas_number?: number;
    role?: GasRole | "";
  }[],
): NormalizedDiveMixture[] {
  return mixtures.map((mixture) => ({
    volume: mixture.volume,
    start_pressure:
      mixture.start_pressure === "" ? undefined : mixture.start_pressure,
    end_pressure:
      mixture.end_pressure === "" ? undefined : mixture.end_pressure,
    oxygen: mixture.oxygen,
    helium: mixture.helium,
    po2_limit: mixture.po2_limit === "" ? undefined : mixture.po2_limit,
    // Passed straight through: unlike the fields above it has no cleared state,
    // because no input writes to it. It is either the number an import put there or
    // absent, which is why its type carries no `""` to normalize away.
    gas_number: mixture.gas_number,
    role: mixture.role === "" ? undefined : mixture.role,
  }));
}

// The inverse of `normalizeMixtures`: a saved mixture as the API returns it,
// turned into the row shape the form edits.
//
// Every optional field on the wire arrives as an explicit `null` when the mixture
// doesn't record it (`DiveMixture` says why), and `null` is not a member of any
// field's union above - so a mixture handed to `form.reset()` unconverted fails
// validation on values the diver never entered. That was invisible rather than
// merely wrong: `gas_number` has no input, so its error had no `FormMessage` to
// render into and the Save button simply did nothing.
//
// Lives here rather than inline in the edit page so that the two directions sit
// together and the conversion is testable against a real response shape.
export function toDiveMixtureInput(mixture: DiveMixture): DiveMixtureInput {
  return {
    id: mixture.id,
    volume: mixture.volume,
    start_pressure: mixture.start_pressure ?? "",
    end_pressure: mixture.end_pressure ?? "",
    oxygen: mixture.oxygen,
    helium: mixture.helium,
    po2_limit: mixture.po2_limit ?? "",
    // The one field with no `""` state, because no input writes to it - see
    // `normalizeMixtures`, which passes it back out the same way.
    gas_number: mixture.gas_number ?? undefined,
    role: mixture.role ?? "",
  };
}

export const diveCreateSchema = z.object({
  dive_number: z
    .number()
    .int()
    .positive("Dive number must be a positive integer"),
  start_time: dateTimeField(),
  duration: durationField(),
  max_depth: z
    .number()
    .positive("Max depth must be positive")
    .nullable()
    .optional(),
  avg_depth: z
    .number()
    .positive("Average depth must be positive")
    .nullable()
    .optional(),
  bottom_temperature: z.number().nullable().optional(),
  visibility: z
    .number()
    .int("Visibility must be an integer")
    .positive("Visibility must be positive")
    .nullable()
    .optional(),
  // Kilograms. `min(0)` rather than `positive()`, unlike the depths above:
  // diving with no lead at all is a real entry, and it's worth distinguishing
  // from not having recorded it - mirrors `ck_dive_weight_non_negative`.
  weight: weightField(),
  trip_uuid: z.string().nullable().optional(),
  dive_site_uuids: z.array(z.string()).default([]),
  gear_item_uuids: z.array(z.string()).default([]),
  notes: z
    .string()
    .max(63206, "Notes cannot exceed 63206 characters")
    .default(""),
  mixtures: z.array(diveMixtureSchema).default([]),
});

export const diveUpdateSchema = z.object({
  dive_number: z
    .number()
    .int()
    .positive("Dive number must be a positive integer")
    .optional(),
  start_time: dateTimeField().optional(),
  duration: durationField().optional(),
  max_depth: z
    .number()
    .positive("Max depth must be positive")
    .nullable()
    .optional(),
  avg_depth: z
    .number()
    .positive("Average depth must be positive")
    .nullable()
    .optional(),
  bottom_temperature: z.number().nullable().optional(),
  visibility: z
    .number()
    .int("Visibility must be an integer")
    .positive("Visibility must be positive")
    .nullable()
    .optional(),
  weight: weightField(),
  // Nullable, not just optional: `null` is how the edit form says "detach this
  // dive from its trip". See `DiveUpdate.trip_uuid` in `lib/api/dives.ts`.
  trip_uuid: z.string().nullable().optional(),
  dive_site_uuids: z.array(z.string()).optional(),
  gear_item_uuids: z.array(z.string()).optional(),
  notes: z
    .string()
    .max(63206, "Notes cannot exceed 63206 characters")
    .optional(),
  mixtures: z.array(diveMixtureSchema).optional(),
});

export type DiveCreateInput = z.input<typeof diveCreateSchema>;
export type DiveUpdateInput = z.input<typeof diveUpdateSchema>;

// What react-hook-form hands over as `formState.dirtyFields`: a field that
// differs from what the form was seeded with is marked, an untouched one is
// absent, and only the top-level keys matter here.
//
// Deliberately not `FieldNamesMarkedBoolean<DiveUpdateInput>`, which is the
// library's own type for it. That type says an array field is marked per index
// (`(boolean | undefined)[]`), and the library does not do that for a
// *registered* array leaf like `dive_site_uuids` - it marks the whole field
// `true`, so the accurate value doesn't type-check against the declared one.
// `dive.render.test.tsx` pins the real shapes against a real `useForm`, since a
// type that disagrees with the library can't be the thing this leans on.
type DiveDirtyFields = Partial<
  Readonly<Record<keyof DiveUpdateInput, unknown>>
>;

// Whether react-hook-form marked anything at or below this node dirty.
//
// Recursive because a field array's entry is a map of its own fields: editing
// one cylinder's end pressure marks `mixtures[1].end_pressure`, and the answer
// for `mixtures` has to be "yes" - the API replaces the list wholesale, so one
// changed cylinder means sending all of them.
function isDirty(marker: unknown): boolean {
  if (marker === true) return true;
  if (Array.isArray(marker)) return marker.some(isDirty);
  if (marker && typeof marker === "object") {
    return Object.values(marker).some(isDirty);
  }
  return false;
}

// Turns the edit form's values into the PATCH body for `divesAPI.updateDive`.
//
// The one rule, and the whole reason this isn't a plain spread: a field that is
// `undefined` was never touched and must not appear in the request at all,
// while a field that is `null` is a value the diver deliberately cleared and
// must be sent so the API can null it out. Collapsing those two together is
// what previously made a dive's trip impossible to remove - the picker cleared
// to `undefined`, the field was dropped, and the trip survived a save that
// reported success.
//
// `dirtyFields` narrows it further, to the fields the diver actually changed,
// and it is what keeps that same `null`-is-a-value rule from turning into a
// data-loss bug in the other direction. The edit form seeds itself from the
// dive's own response, so everything it submits is either an edit or an echo -
// and once the API stopped rendering soft-deleted trips and sites on a dive
// (see DECISIONS.md), some of those echoes became lies. A dive whose trip had
// been deleted came back with `trip_uuid: null`, the form echoed the null back,
// and `patch_dive` read it as "the diver cleared the trip" and unlinked it for
// good; the same round trip re-sent a `dive_site_uuids` shortened by the sites
// the API had hidden, which the API applies by deleting and reinserting the
// join rows. Pressing Save on a dive nobody had edited destroyed both, with no
// undelete path and no trace left in `export.json`.
//
// The two requests are identical on the wire, so the API cannot tell them
// apart - "the diver cleared the trip" and "the client echoed back a null it
// was handed" are the same PATCH. In the form they are trivially different, and
// this is where that knowledge lives. Omitting it is still supported, for
// callers with no form behind them.
//
// `duration` is the only shape change: the form edits it as an "MM:SS" string
// and the API takes seconds. Done here rather than in the schema because
// `z.transform()` on a field feeding a `z.input<>`-derived form type breaks
// `useForm()`'s binding - see CONTRIBUTING.md.
export function buildDiveUpdate(
  values: DiveUpdateInput,
  dirtyFields?: DiveDirtyFields,
): DiveUpdate {
  // Dropped to `undefined` rather than filtered out of the result afterwards:
  // `undefined` is already this function's word for "don't send it", so an
  // untouched field takes the same path as one the form never had a value for.
  const data: DiveUpdateInput = dirtyFields
    ? (Object.fromEntries(
        Object.keys(values).map((field) => [
          field,
          isDirty(dirtyFields[field as keyof DiveDirtyFields])
            ? values[field as keyof DiveUpdateInput]
            : undefined,
        ]),
      ) as DiveUpdateInput)
    : values;

  const update: DiveUpdate = {};

  if (data.dive_number !== undefined) update.dive_number = data.dive_number;
  if (data.start_time !== undefined) update.start_time = data.start_time;
  if (data.duration !== undefined) {
    update.duration = parseFormDuration(data.duration);
  }
  if (data.max_depth !== undefined) update.max_depth = data.max_depth;
  if (data.avg_depth !== undefined) update.avg_depth = data.avg_depth;
  if (data.bottom_temperature !== undefined) {
    update.bottom_temperature = data.bottom_temperature;
  }
  if (data.visibility !== undefined) update.visibility = data.visibility;
  if (data.weight !== undefined) update.weight = data.weight;
  if (data.trip_uuid !== undefined) update.trip_uuid = data.trip_uuid;
  if (data.dive_site_uuids !== undefined) {
    update.dive_site_uuids = data.dive_site_uuids;
  }
  if (data.gear_item_uuids !== undefined) {
    update.gear_item_uuids = data.gear_item_uuids;
  }
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.mixtures !== undefined) {
    update.mixtures = normalizeMixtures(data.mixtures);
  }

  return update;
}
