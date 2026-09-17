// The dive form's hideable fields: the vocabulary, the panel's registry, and the
// value rules that go with them.
//
// The API owns the vocabulary as a `StrEnum` and validates against it, so what is
// below is a hand-kept mirror in the pattern this repo already uses for `TANK_USAGE`
// and the water types (DECISIONS.md, "`TANK_USAGE` is a fourth hand-kept vocabulary
// mirror"). What keeps the mirror honest without a cross-repo test is a two-sided
// guard: the API asserts every one of its values names a non-required field of
// `DiveCreateRequest` (or, prefixed, of `DiveMixtureCreate`), and
// `dive-form-fields.test.ts` here asserts this list equals the optional keys of
// `diveCreateSchema` and `diveMixtureSchema` exactly, minus the named exclusions
// below. API-optional is wider than form-optional, which is why that side is a
// subset check and this one is an equality check.

/**
 * Every field of the dive form a diver may hide, in form order.
 *
 * **Order is load-bearing.** It is the canonical order the API stores every hidden
 * set in, so two equal sets are two equal lists and "which preset matches the current
 * state?" is one element-by-element comparison; and it is the order the Fields dialog
 * takes its rows from.
 *
 * **These are stored data, not labels.** A preset row and a diver's own hidden set
 * name them, so renaming one is a data migration on both sides rather than a rename.
 */
export const DIVE_FORM_FIELDS = [
  "trip_uuid",
  "course_uuid",
  "dive_site_uuids",
  "max_depth",
  "avg_depth",
  "bottom_temperature",
  "visibility",
  "water_type",
  "altitude",
  "mixtures",
  "gear_item_uuids",
  "weight",
  "species_uuids",
  "notes",
  "mixture.po2_limit",
  "mixture.helium",
  "mixture.start_pressure",
  "mixture.end_pressure",
  "mixture.role",
  "mixture.usage",
] as const;

export type DiveFormFieldKey = (typeof DIVE_FORM_FIELDS)[number];

/**
 * Marks a key as naming a field of *every* cylinder rather than of the dive.
 *
 * Deliberately not react-hook-form's own path (`mixtures.0.po2_limit`): a key names
 * the column, not one row of it, and hiding it hides that input on every tank card.
 */
export const MIXTURE_FIELD_PREFIX = "mixture.";

/** True for a key that governs a column of the cylinder list. */
export function isMixtureField(key: DiveFormFieldKey): boolean {
  return key.startsWith(MIXTURE_FIELD_PREFIX);
}

/** The field name a `mixture.` key governs on one cylinder row. */
export function mixtureFieldName(key: DiveFormFieldKey): string {
  return key.slice(MIXTURE_FIELD_PREFIX.length);
}

/** The per-cylinder keys, in form order - the columns a tank card can lose. */
export const MIXTURE_FORM_FIELDS = DIVE_FORM_FIELDS.filter(isMixtureField);

/**
 * Keys of `diveMixtureSchema` that accept `undefined` and are still not hideable,
 * with the reason each is exempt. The registry guard reads this list rather than
 * restating it, so an exemption cannot be made silently.
 *
 * `id` and `gas_number` have no input at all - the first is stripped on submit, the
 * second round-trips untouched from an imported file.
 *
 * `volume` and `oxygen` became blank-able when a cylinder was allowed to record a mix
 * with no vessel, and they are exempt on the substance rather than on the type: they
 * are what a cylinder *is*. A tank card that can lose both records a row with nothing
 * in it, and "Add mixture" would propose `DEFAULT_MIXTURE` where the diver could
 * neither see nor change it - which is the half of that change the split was chosen to
 * protect.
 *
 * `helium` was exempt with them and is not any more. It is the one of the three a diver
 * can be certain about without measuring: air and nitrox have none, so a logbook that
 * never records a trimix fill is asking a question whose answer is always the same. A
 * cylinder recording no helium is a cylinder of air; one recording no volume or oxygen
 * says nothing at all. The API grew a `mixture.helium` member to match, since a hidden
 * set is validated there.
 */
export const NON_HIDEABLE_MIXTURE_SCHEMA_KEYS = [
  "id",
  "gas_number",
  "volume",
  "oxygen",
] as const;

/**
 * The form's own field groups, in the order the form renders them.
 *
 * **The dialog lists fields in the order the form renders them**, and that order is the
 * invariant to preserve when either side moves: it is what makes a diver looking for a
 * field in the dialog find it where they would look for it on the form. Headings mark
 * runs of that one order; they never reorder it and never interleave.
 *
 * This used to be stated in terms of blocks - "a group is a run of adjacent blocks,
 * never part of one" - where a block was a row, and a row was a set of fields that had
 * to appear and disappear together. The readings grid ended that: max depth, average
 * depth, bottom temperature, visibility, water type and altitude share one grid in
 * which each hides on its own and the survivors reflow, so there is no row-sized unit
 * left for a heading to align to, and "Dive info" and "Environment" would each own part
 * of the same one. What the block rule was protecting is the order, so the order is what
 * this now says. See "Hidden dive-form fields leave a ragged edge, never a hole" in
 * `DECISIONS.md`.
 *
 * Headings are still coarser than the form's rows, deliberately. "Trip, course & site"
 * covers the trip/course pair and the dive site below it; "Dive info" covers start time,
 * the dive number/duration pair and the two depths; "Environment" covers the other four
 * readings. A heading per row would offer more choices than there are decisions to make.
 *
 * Groups carried only by always-on rows are listed anyway - a gap where Start time should
 * be reads as a field that went missing.
 */
export const DIVE_FORM_FIELD_GROUPS = [
  "Trip, course & site",
  "Dive info",
  "Environment",
  "Gas mixtures",
  "Gear & weight",
  "Species",
  "Notes",
] as const;

export type DiveFormFieldGroup = (typeof DIVE_FORM_FIELD_GROUPS)[number];

export interface DiveFormFieldEntry {
  key: DiveFormFieldKey;
  /** The field's own visible label on the form, so the panel names what the diver sees. */
  label: string;
  group: DiveFormFieldGroup;
}

/**
 * Every hideable field with the label and group the panel lists it under, in form
 * order. Its completeness against the form schemas is a test, not a convention - a
 * new optional input fails the suite until it is registered here.
 */
export const DIVE_FORM_FIELD_REGISTRY: readonly DiveFormFieldEntry[] = [
  {
    key: "trip_uuid",
    label: "Trip",
    group: "Trip, course & site",
  },
  { key: "course_uuid", label: "Course", group: "Trip, course & site" },
  {
    key: "dive_site_uuids",
    label: "Dive site(s)",
    group: "Trip, course & site",
  },
  { key: "max_depth", label: "Maximum depth", group: "Dive info" },
  { key: "avg_depth", label: "Average depth", group: "Dive info" },
  {
    key: "bottom_temperature",
    label: "Bottom temperature",
    group: "Environment",
  },
  { key: "visibility", label: "Visibility", group: "Environment" },
  { key: "water_type", label: "Water type", group: "Environment" },
  { key: "altitude", label: "Altitude", group: "Environment" },
  { key: "mixtures", label: "Gas Mixtures", group: "Gas mixtures" },
  { key: "gear_item_uuids", label: "Gear", group: "Gear & weight" },
  { key: "weight", label: "Weight", group: "Gear & weight" },
  { key: "species_uuids", label: "Species spotted", group: "Species" },
  { key: "notes", label: "Notes", group: "Notes" },
  { key: "mixture.po2_limit", label: "ppO₂ limit", group: "Gas mixtures" },
  { key: "mixture.helium", label: "He", group: "Gas mixtures" },
  {
    key: "mixture.start_pressure",
    label: "Start pressure",
    group: "Gas mixtures",
  },
  { key: "mixture.end_pressure", label: "End pressure", group: "Gas mixtures" },
  { key: "mixture.role", label: "Role", group: "Gas mixtures" },
  { key: "mixture.usage", label: "Usage", group: "Gas mixtures" },
];

/**
 * The inputs the Fields dialog lists as always shown, so a diver looking for "Duration"
 * finds it rather than a gap where it should be.
 *
 * Three of them are required by the create schema; the two cylinder fields are exempt
 * rather than required - see `NON_HIDEABLE_MIXTURE_SCHEMA_KEYS`. Both reasons end in
 * the same row: a switch that is on and will not move, which is the only claim the
 * dialog makes about either.
 */
export const DIVE_FORM_ALWAYS_ON_FIELDS: readonly {
  label: string;
  group: DiveFormFieldGroup;
}[] = [
  // Form order, which is the invariant above: Start time is its own row, and Dive
  // number and Duration are the pair below it, left to right.
  { label: "Start time", group: "Dive info" },
  { label: "Dive number", group: "Dive info" },
  { label: "Duration", group: "Dive info" },
  { label: "Volume", group: "Gas mixtures" },
  { label: "O₂", group: "Gas mixtures" },
];

/**
 * Collapses duplicates and imposes `DIVE_FORM_FIELDS` order, exactly as the API's
 * `canonical_hidden_fields` does on every write.
 *
 * Applied before every `PATCH` and to everything read back, so a hidden set is a
 * *set* spelled as a list and comparing two of them is one loop.
 */
export function canonicalHiddenFields(
  values: Iterable<DiveFormFieldKey>,
): DiveFormFieldKey[] {
  const present = new Set(values);
  return DIVE_FORM_FIELDS.filter((field) => present.has(field));
}

/** Whether two hidden sets are the same set, which is what marks the matching preset. */
export function hiddenFieldsEqual(
  first: Iterable<DiveFormFieldKey>,
  second: Iterable<DiveFormFieldKey>,
): boolean {
  const left = canonicalHiddenFields(first);
  const right = canonicalHiddenFields(second);
  return (
    left.length === right.length && left.every((key, i) => key === right[i])
  );
}

/**
 * What each key holds when it is empty.
 *
 * Not one sentinel: every dive scalar clears to `null` and the mixture columns clear
 * to `""`, which is the split `UnitNumberInput.emptyValue` exists to serve. The rule
 * behind both is anti-`undefined` - react-hook-form re-displays a field's default the
 * moment its value resolves to `undefined`, so an "emptied" field would fill itself
 * back in from whatever the prefill left as the default.
 */
export const EMPTY_DIVE_FORM_VALUES: Readonly<
  Record<DiveFormFieldKey, unknown>
> = {
  trip_uuid: null,
  course_uuid: null,
  dive_site_uuids: [],
  max_depth: null,
  avg_depth: null,
  bottom_temperature: null,
  visibility: null,
  water_type: "",
  altitude: null,
  mixtures: [],
  gear_item_uuids: [],
  weight: null,
  species_uuids: [],
  notes: "",
  "mixture.po2_limit": "",
  // The one column that clears to a *number*, and the only one whose absence means
  // something. Hiding He is the diver saying they dive air and nitrox - which is what
  // made it hideable at all - so the value it clears to has to be the zero that claim
  // implies, matching `DEFAULT_MIXTURE.helium`. `""` here would spell "not recorded",
  // and `gasName`/`isNameableMix` refuse to name a mix whose helium is unknown: every
  // cylinder under Basic or Recreational would lose its "Air"/"EAN32" and its MOD, and
  // a hand-added tank (which takes `DEFAULT_MIXTURE` whole, hidden column or not) would
  // disagree with a carried one on the same dive, in a column neither is showing.
  //
  // Hiding cannot overwrite a recorded helium: a cylinder that holds one is non-empty,
  // so the reveal rule puts the column back on screen and marks it the diver's.
  "mixture.helium": 0,
  "mixture.start_pressure": "",
  "mixture.end_pressure": "",
  "mixture.role": "",
  "mixture.usage": "",
};

/**
 * The keys whose empty value is a real value rather than a blank, and what each is.
 *
 * Only `mixture.helium`, whose `0` is the claim hiding the column makes - see "A hidden
 * helium is `0`, not blank" in DECISIONS.md. Every other key clears to `null`, `""` or
 * `[]`, and that is the rule: an empty value the reveal rule would call non-empty is
 * normally a mistake, since the key would put itself back on screen the moment a stored
 * dive held one. The registry guard reads this list rather than restating it, so a second
 * exception cannot be made silently, and it pins the value as well as the name.
 */
export const NON_BLANK_EMPTY_FIELD_VALUES: Partial<
  Record<DiveFormFieldKey, unknown>
> = {
  "mixture.helium": 0,
};

/**
 * "Non-empty" as the reveal rule means it: not `undefined`, not `null`, not `""` and
 * not `[]`. `0` is a value - an end pressure of 0 is a drained cylinder, not a
 * missing reading.
 */
export function isNonEmptyFieldValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** The shape the reveal rule reads: a form's values, as loosely as it needs them. */
export type DiveFormFieldValues = {
  readonly [key: string]: unknown;
} & { readonly mixtures?: readonly Record<string, unknown>[] };

/**
 * Whether a value in `key` is one the reveal rule should put back on screen.
 *
 * Non-empty, *and* not simply what hiding the key would have written there. The second
 * half exists for `mixture.helium` and reads as a no-op everywhere else: every other
 * key clears to `null`, `""` or `[]`, which the first half already rejects. Helium
 * clears to `0`, and `0` is the value nearly every stored cylinder holds - so without
 * this, loading any air or nitrox dive would reveal the column the diver hid, on every
 * dive they own, and hiding He would work until the first time they opened a dive.
 *
 * A key does not reveal itself by holding what hiding it writes. `mixture.end_pressure`
 * still reveals on a stored `0`, because its empty value is `""`: a drained cylinder is
 * a reading, and that distinction is the whole reason the empty values are per-key.
 */
function revealsField(key: DiveFormFieldKey, value: unknown): boolean {
  return isNonEmptyFieldValue(value) && value !== EMPTY_DIVE_FORM_VALUES[key];
}

/**
 * Every key these values hold something in - what the four "a value arrived from
 * outside the diver's typing" moments reveal.
 *
 * A per-cylinder key counts as non-empty when *any* cylinder holds a value for it, so
 * an edit load or an import that brings the gas section back brings every column some
 * tank recorded with it: an imported start pressure lands on screen rather than
 * behind an unchecked box.
 */
export function nonEmptyDiveFormFields(
  values: DiveFormFieldValues,
): DiveFormFieldKey[] {
  const mixtures = Array.isArray(values.mixtures) ? values.mixtures : [];

  return DIVE_FORM_FIELDS.filter((key) => {
    if (!isMixtureField(key)) return revealsField(key, values[key]);
    const name = mixtureFieldName(key);
    return mixtures.some((row) => revealsField(key, row?.[name]));
  });
}

/**
 * The keys a failed submit has to put back on screen.
 *
 * The resolver validates hidden fields too (react-hook-form's default
 * `shouldUnregister: false` keeps their values in form state), so a hidden
 * field carrying an error would otherwise block the save with no message
 * anywhere on the page - the exact shape of "The API sends `null` and the form
 * schema wants `""`, so `toDiveMixtureInput` converts at the boundary". A
 * per-cylinder error also reveals `mixtures`, since its message has nowhere to
 * render while the section is off screen.
 */
export function diveFormFieldsWithErrors(
  errors: Record<string, unknown>,
): DiveFormFieldKey[] {
  const revealed = new Set<DiveFormFieldKey>();

  for (const key of DIVE_FORM_FIELDS) {
    if (!isMixtureField(key) && errors[key] !== undefined) revealed.add(key);
  }

  const mixtureErrors = errors.mixtures;
  if (mixtureErrors !== undefined) revealed.add("mixtures");
  if (Array.isArray(mixtureErrors)) {
    for (const row of mixtureErrors) {
      if (!row) continue;
      for (const key of MIXTURE_FORM_FIELDS) {
        if ((row as Record<string, unknown>)[mixtureFieldName(key)]) {
          revealed.add(key);
        }
      }
    }
  }

  return canonicalHiddenFields(revealed);
}
