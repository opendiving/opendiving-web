import { z } from "zod";
import { notesField } from "./notes";
import {
  formatDurationForForm,
  parseFormDuration,
  parseUtcOffsetMinutes,
} from "@/lib/date-time";
import {
  GAS_ROLES,
  TANK_USAGE,
  WATER_TYPES,
  type Dive,
  type DiveMixture,
  type DiveUpdate,
  type GasRole,
  type TankUsage,
} from "@/lib/api/dives";
import { barToPsi, displayBound } from "@/lib/units";

// Same ISO 8601 shape as the API's `Dive.start_time`, e.g.
// "2021-04-04T10:04:47+02:00" - produced/consumed by `DiveStartTimeField`
// (`components/dives/dive-start-time-field.tsx`), so the form and the API
// always agree on a single `start_time` value with no separate offset field
// to keep in sync.
// Whether `Date` can read the value at all. An offsetless date-time parses fine
// here (as browser-local, which is wrong for *display* and the whole subject of
// `shiftByEmbeddedOffset` - but validity is the same question either way), so
// this one predicate serves both fields below.
const isRealDateTime = (val: string) => !Number.isNaN(new Date(val).getTime());

// A *new* dive must carry an offset, matching the API's `DiveCreate`: there is
// nothing to preserve, and the form defaults the field to the browser's own
// offset, so an offsetless value here could only be a mistake.
const dateTimeField = (
  message = "Start time must include a UTC offset, e.g. 2021-04-04T10:04:47+02:00",
) =>
  z
    .string()
    .min(1, "Start time is required")
    .refine((val) => parseUtcOffsetMinutes(val) !== null, { message })
    .refine(isRealDateTime, {
      message: "Start time must be a valid datetime",
    });

// An *edit* accepts both shapes, and that is a deliberate relaxation rather than
// a gap. `PATCH /dive/{uuid}` takes an offsetless `start_time` on a dive whose
// own offset is already unknown - the state a DiveJSON import creates - and
// refuses one on a dive that has an offset, `0` included. A bare date follows
// the same rule on a dive whose time of day is unknown. Only the server can
// apply that rule: it turns on the *stored* offset, which this schema cannot
// see, and re-deriving it in the form from a value the form itself is editing is
// how a client ends up refusing what the API accepts.
//
// So the client checks the shape and the server checks the rule. A refusal comes
// back as HTTP 422 with a flat `{"detail": "<sentence>"}` - not the per-field
// array a Pydantic field error produces - which is why every caller renders it
// through `getApiErrorMessage` rather than reading `detail` structurally.
const updatedDateTimeField = () =>
  z.string().min(1, "Start time is required").refine(isRealDateTime, {
    message: "Start time must be a valid datetime",
  });

// "MM" or "MM:SS", e.g. "45" or "45:30" - minutes can be 1-3 digits, and the
// seconds, when given, must be two digits from 00-59. Converted to/from a plain
// seconds number right before hitting the API via
// `parseFormDuration()`/`formatDurationForForm()` in `lib/date-time.ts` - see
// `dateTimeField()` above for the same pattern.
//
// The colonless form is what most dive logs actually hold: a computer reports
// whole minutes and a hand-written slate carries nothing finer, so making the
// common entry the longer one ("45:00") was the field's own placeholder
// promising something the regex refused. A bare number is read as minutes, which
// is the only reading a duration written without a colon can have - "130" is 130
// minutes, never 1:30. The seconds half stays strict so a mistyped ":75" is still
// caught rather than silently rolling over.
const DURATION_REGEX = /^\d{1,3}(?::[0-5]\d)?$/;

const durationField = (
  message = "Duration must be minutes or MM:SS, e.g. 45 or 67:30",
) => z.string().min(1, "Duration is required").regex(DURATION_REGEX, message);

// Total ballast carried on the dive, in kilograms. Identical in the create and
// update schemas (it's optional in both), so it lives in one helper rather than
// being written out twice.
const weightField = () =>
  z.number().min(0, "Weight must be zero or positive").nullable().optional();

// The water the dive was in, as a `<select>` edits it. `""` is the "Not recorded"
// option's value and a live form state, never something sent to the API: it is the
// cleared sentinel react-hook-form needs (see `diveMixtureSchema.role`, the same
// pattern for the same reason), converted away by `buildDiveUpdate` and by the create
// page's submit.
const waterTypeField = () =>
  z
    .union([z.literal(""), z.enum(WATER_TYPES)])
    .nullable()
    .optional();

// Metres above sea level of the water surface, mirroring the API's
// `ck_dive_altitude_range`. The band is a unit/typo check rather than a judgement about
// where people dive: the Dead Sea (~-430 m) is the lowest diveable surface there is,
// and the highest attested dives are the Ojos del Salado pool at ~6390 m. Integer,
// because metre resolution is already finer than anything reads it.
const ALTITUDE_MIN_M = -450;
const ALTITUDE_MAX_M = 6500;

// Both bounds say the whole range, and say it in both systems: a diver typing feet
// has their entry stored as metres, so a metre-worded ceiling names a number they
// never typed. The figures are computed from the same `displayBound` the input's own
// spinner uses, so the sentence and the box it appears under cannot disagree - and
// they are computed once here rather than per-system, because a schema that varied
// by preference would put the diver's units into validation, which is exactly what
// keeping form state metric avoids.
const ALTITUDE_RANGE_MESSAGE =
  `Altitude must be between ${ALTITUDE_MIN_M} and ${ALTITUDE_MAX_M} m ` +
  `(${displayBound(ALTITUDE_MIN_M, "altitude", "imperial", "min").toLocaleString("en-US")} and ` +
  `${displayBound(ALTITUDE_MAX_M, "altitude", "imperial", "max").toLocaleString("en-US")} ft)`;

const altitudeField = () =>
  z
    .number()
    // Metric-worded on purpose, and reachable only in metric mode: imperial entry
    // commits whole metres itself, so this message is only ever read by someone who
    // typed the fraction it is complaining about.
    .int("Altitude must be a whole number of meters")
    .min(ALTITUDE_MIN_M, ALTITUDE_RANGE_MESSAGE)
    .max(ALTITUDE_MAX_M, ALTITUDE_RANGE_MESSAGE)
    .nullable()
    .optional();

// Optional numeric field that can also hold the literal empty string "" while
// the user is editing. We deliberately never let the *live* form value become
// `undefined` for these fields: react-hook-form falls back to re-displaying a
// field's default value whenever its current value resolves to `undefined`,
// which made these fields appear to "reset" the moment they were cleared.
// Using "" as the empty state avoids that; callers are responsible for
// converting "" to `undefined` right before sending data to the API (see
// `normalizeMixtures` usage in the dive form pages).
const MAX_PRESSURE_BAR = 350;

// The ceiling in both systems, so an imperial diver who typed 5,500 psi is told
// about the limit they crossed rather than about a bar figure they never entered.
// Computed from `PSI_PER_BAR` rather than typed out, for the same reason the
// altitude range is: a hand-written 5,076 is a second place for the number to be
// wrong. One string, not one per system - the rare violation then reads correctly
// whichever mode the form is in, and the schema stays unaware of the preference.
const PRESSURE_CEILING_CLAUSE =
  `must be at most ${MAX_PRESSURE_BAR} bar ` +
  `(${Math.round(barToPsi(MAX_PRESSURE_BAR)).toLocaleString("en-US")} psi) — ` +
  `check the units on that reading.`;

export const diveMixtureSchema = z
  .object({
    id: z.number().optional(),
    // Blank is a real answer here, and it is the same `""` the pressures below use
    // rather than a second spelling of empty: a file that recorded a gas and no
    // vessel stores no size, and the form has to be able to say that back. The
    // convenience of a proposed 11.1 L survives where it belongs - `DEFAULT_MIXTURE`,
    // which only a cylinder added by hand starts from, and which the diver can see and
    // change. It is the *import* path that stopped inventing one.
    volume: z
      .union([z.literal(""), z.number().positive("Volume must be positive")])
      .optional(),
    // The two pressures are deliberately not symmetric, and one sentence of diving
    // is the whole reason: you cannot start a dive on an empty cylinder, but you
    // can finish one on an empty cylinder. An out-of-gas ascent, a drained stage
    // and an SPG pegged at zero are real dives worth logging honestly, so 0 is a
    // legal end pressure; no dive's first breath came from a cylinder reading 0,
    // so it is not a legal start pressure. Don't "fix" the inconsistency between
    // these two adjacent fields - it is the design, not an oversight.
    //
    // Mirrors `ck_dive_mixture_start_pressure_range` /
    // `ck_dive_mixture_end_pressure_range` and `DiveMixtureCreate`'s `gt=0, le=350`
    // / `ge=0, le=350`, so a value this form accepts is one the API will store. The
    // 350 bar ceiling is a unit check rather than an opinion about how hard a
    // cylinder is filled: it sits above any real 300 bar DIN fill, so what it can
    // catch is a psi reading typed as bar, the millibar-for-bar error the DM5 XML
    // parser once shipped, and a sidemount pair whose two pressures were summed as
    // if they were one cylinder.
    //
    // Both fields carry the ceiling, and the `end <= start` rule below is not a
    // substitute for the end one: it returns early when the start box is blank, so
    // a lone end pressure would otherwise reach the API unbounded.
    //
    // A diver who doesn't know a pressure leaves the box blank - `""` here, `null`
    // on the wire - so neither field needs 0 as a stand-in for "unrecorded", and
    // the start message says so rather than leaving it to be guessed.
    start_pressure: z
      .union([
        z.literal(""),
        z
          .number()
          .positive(
            "A cylinder can't start a dive empty — enter the fill pressure, or leave this blank if it wasn't recorded.",
          )
          .max(MAX_PRESSURE_BAR, `Start pressure ${PRESSURE_CEILING_CLAUSE}`),
      ])
      .optional(),
    end_pressure: z
      .union([
        z.literal(""),
        z
          .number()
          .min(0, "End pressure must be zero or positive")
          .max(MAX_PRESSURE_BAR, `End pressure ${PRESSURE_CEILING_CLAUSE}`),
      ])
      .optional(),
    // Blank for the same reason as `volume`, and the stakes are higher: a diver plans
    // gas off these two, so a source that never recorded a mix must not have air
    // assumed for it. Absent is not 21 % and not 0 % helium - it is unknown, and the
    // gas name, the MOD and the END/EAD all decline to render rather than describing a
    // cylinder nobody analysed.
    oxygen: z
      .union([
        z.literal(""),
        z
          .number()
          .min(0, "Oxygen percentage must be at least 0")
          .max(100, "Oxygen percentage must be at most 100"),
      ])
      .optional(),
    helium: z
      .union([
        z.literal(""),
        z
          .number()
          .min(0, "Helium percentage must be at least 0")
          .max(100, "Helium percentage must be at most 100"),
      ])
      .optional(),
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
    // Same shape and same reason as `role` above - a real "Not recorded" option that
    // has to survive being chosen. The vocabulary is the API's `TankUsage`, so an
    // invented member would be rejected on save rather than here.
    usage: z.union([z.literal(""), z.enum(TANK_USAGE)]).optional(),
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
      //
      // A blank box is quiet for a different reason: two fractions can only be
      // said to exceed the whole when both of them are recorded. Reading a cleared
      // `""` as 0 would make an unknown helium content into a claim that there is
      // none, which is exactly the substitution this field stopped making.
      const { oxygen, helium } = mixture;
      if (typeof oxygen !== "number" || typeof helium !== "number") return true;
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
  volume?: number;
  start_pressure?: number;
  end_pressure?: number;
  oxygen?: number;
  helium?: number;
  po2_limit?: number;
  gas_number?: number;
  role?: GasRole;
  usage?: TankUsage;
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
    volume?: number | "";
    start_pressure?: number | "";
    end_pressure?: number | "";
    oxygen?: number | "";
    helium?: number | "";
    po2_limit?: number | "";
    gas_number?: number;
    role?: GasRole | "";
    usage?: TankUsage | "";
  }[],
): NormalizedDiveMixture[] {
  return mixtures.map((mixture) => ({
    volume: mixture.volume === "" ? undefined : mixture.volume,
    start_pressure:
      mixture.start_pressure === "" ? undefined : mixture.start_pressure,
    end_pressure:
      mixture.end_pressure === "" ? undefined : mixture.end_pressure,
    oxygen: mixture.oxygen === "" ? undefined : mixture.oxygen,
    helium: mixture.helium === "" ? undefined : mixture.helium,
    po2_limit: mixture.po2_limit === "" ? undefined : mixture.po2_limit,
    // Passed straight through: unlike the fields above it has no cleared state,
    // because no input writes to it. It is either the number an import put there or
    // absent, which is why its type carries no `""` to normalize away.
    gas_number: mixture.gas_number,
    role: mixture.role === "" ? undefined : mixture.role,
    usage: mixture.usage === "" ? undefined : mixture.usage,
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
    volume: mixture.volume ?? "",
    start_pressure: mixture.start_pressure ?? "",
    end_pressure: mixture.end_pressure ?? "",
    oxygen: mixture.oxygen ?? "",
    helium: mixture.helium ?? "",
    po2_limit: mixture.po2_limit ?? "",
    // The one field with no `""` state, because no input writes to it - see
    // `normalizeMixtures`, which passes it back out the same way.
    gas_number: mixture.gas_number ?? undefined,
    role: mixture.role ?? "",
    usage: mixture.usage ?? "",
  };
}

/**
 * The dive as the edit form holds it, seeded from the API's own response.
 *
 * Faithful, field for field, and that is the whole specification: the form
 * submits everything it holds, so anything invented here is written back to the
 * dive on the first save. `mixtures` is where that bites. A dive with no
 * cylinders is a legitimate record - `DiveCreate.mixtures` defaults to an empty
 * list - and seeding one `DEFAULT_MIXTURE` row for it, as this page did while
 * the form only submitted what the diver had touched, now means editing the
 * notes on a cylinder-less dive silently adds an 11.1 L air cylinder nobody
 * entered.
 *
 * The narrower alternative - keep the synthetic row and have `buildDiveUpdate`
 * drop `mixtures` when the dive arrived with none and the field still holds one
 * pristine `DEFAULT_MIXTURE` - is worse than it looks. `DEFAULT_MIXTURE` is an
 * aluminium 80 of air, the "11.1 L (AL80)" preset and the most common
 * recreational cylinder there is, so a guard keyed on value-equality with it
 * makes exactly that cylinder unsavable on exactly the dives that need it.
 *
 * Lives here rather than inline on the page so the seeding is testable at the
 * seam it belongs to, beside `toDiveMixtureInput`, which it is the caller of.
 */
export function diveToFormValues(dive: Dive): DiveUpdateInput {
  return {
    dive_number: dive.dive_number,
    // Already the shape `DiveStartTimeField` edits, so it carries straight over
    // with no conversion - including a value with no offset at all, which is an
    // imported dive whose zone was never recorded. Copying it verbatim is what
    // preserves that state: anything normalizing it here would be inventing the
    // offset before the diver ever saw the field.
    start_time: dive.start_time,
    duration: formatDurationForForm(dive.duration),
    max_depth: dive.max_depth,
    avg_depth: dive.avg_depth,
    bottom_temperature: dive.bottom_temperature,
    visibility: dive.visibility,
    // `""`, not `null`: the picker's "Not recorded" option is what an unrecorded
    // water type has to select, and `null` is a member of the field's union only so
    // the *submit* direction can say "cleared". Same conversion at the same boundary
    // as `toDiveMixtureInput`'s.
    water_type: dive.water_type ?? "",
    altitude: dive.altitude,
    weight: dive.weight,
    trip_uuid: dive.trip_uuid,
    course_uuid: dive.course_uuid,
    contact_uuid: dive.contact_uuid ?? null,
    dive_site_uuids: dive.dive_sites?.map((site) => site.uuid) ?? [],
    gear_item_uuids: dive.gear_items?.map((item) => item.uuid) ?? [],
    species_uuids: dive.species?.map((s) => s.uuid) ?? [],
    notes: dive.notes || "",
    // Converted field by field rather than spread: every optional field arrives
    // as an explicit `null` when the mixture doesn't record it, and `null`
    // satisfies none of their unions in `diveMixtureSchema`. See
    // `toDiveMixtureInput`.
    mixtures: dive.mixtures?.map(toDiveMixtureInput) ?? [],
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
  water_type: waterTypeField(),
  altitude: altitudeField(),
  // Kilograms. `min(0)` rather than `positive()`, unlike the depths above:
  // diving with no lead at all is a real entry, and it's worth distinguishing
  // from not having recorded it - mirrors `ck_dive_weight_non_negative`.
  weight: weightField(),
  trip_uuid: z.string().nullable().optional(),
  course_uuid: z.string().nullable().optional(),
  contact_uuid: z.string().nullable().optional(),
  dive_site_uuids: z.array(z.string()).default([]),
  gear_item_uuids: z.array(z.string()).default([]),
  species_uuids: z.array(z.string()).default([]),
  notes: notesField().default(""),
  mixtures: z.array(diveMixtureSchema).default([]),
});

export const diveUpdateSchema = z.object({
  dive_number: z
    .number()
    .int()
    .positive("Dive number must be a positive integer")
    .optional(),
  start_time: updatedDateTimeField().optional(),
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
  water_type: waterTypeField(),
  altitude: altitudeField(),
  weight: weightField(),
  // Nullable, not just optional: `null` is how the edit form says "detach this
  // dive from its trip". See `DiveUpdate.trip_uuid` in `lib/api/dives.ts`.
  trip_uuid: z.string().nullable().optional(),
  // And the same for the training course and the contact, for the same reason.
  course_uuid: z.string().nullable().optional(),
  contact_uuid: z.string().nullable().optional(),
  dive_site_uuids: z.array(z.string()).optional(),
  gear_item_uuids: z.array(z.string()).optional(),
  species_uuids: z.array(z.string()).optional(),
  notes: notesField().optional(),
  mixtures: z.array(diveMixtureSchema).optional(),
});

export type DiveCreateInput = z.input<typeof diveCreateSchema>;
export type DiveUpdateInput = z.input<typeof diveUpdateSchema>;

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
// It used to take react-hook-form's `dirtyFields` as well, and drop every field
// the diver had not touched. That existed because the API soft-deleted trips
// and dive sites and then hid them from a dive read, which made the form's own
// seed a lie: a dive whose trip had been deleted came back with
// `trip_uuid: null`, and echoing that null back unlinked the trip for real. The
// API hard-deletes those rows now and hides nothing, so a read is the whole
// truth and an echo of it says exactly what the dive already holds - see "The
// edit form submits the whole dive, because the read is the whole dive" in
// DECISIONS.md.
//
// `duration` is the only shape change: the form edits it as an "MM:SS" string
// and the API takes seconds. Done here rather than in the schema because
// `z.transform()` on a field feeding a `z.input<>`-derived form type breaks
// `useForm()`'s binding - see CONTRIBUTING.md.
export function buildDiveUpdate(data: DiveUpdateInput): DiveUpdate {
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
  if (data.water_type !== undefined) {
    // The select's cleared state is `""`, which the API's enum would reject. It is
    // still a value the diver chose, so it goes out as an explicit `null` - dropping
    // the field instead would be the "cleared vs. untouched" collapse this whole
    // helper exists to avoid.
    update.water_type = data.water_type === "" ? null : data.water_type;
  }
  if (data.altitude !== undefined) update.altitude = data.altitude;
  if (data.weight !== undefined) update.weight = data.weight;
  if (data.trip_uuid !== undefined) update.trip_uuid = data.trip_uuid;
  if (data.course_uuid !== undefined) update.course_uuid = data.course_uuid;
  if (data.contact_uuid !== undefined) update.contact_uuid = data.contact_uuid;
  if (data.dive_site_uuids !== undefined) {
    update.dive_site_uuids = data.dive_site_uuids;
  }
  if (data.gear_item_uuids !== undefined) {
    update.gear_item_uuids = data.gear_item_uuids;
  }
  if (data.species_uuids !== undefined) {
    update.species_uuids = data.species_uuids;
  }
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.mixtures !== undefined) {
    update.mixtures = normalizeMixtures(data.mixtures);
  }

  return update;
}
