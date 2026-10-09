"use client";

import { useId, type ReactNode } from "react";
import { Control, FieldValues, Path, useWatch } from "react-hook-form";
import {
  ArrowDownToLine,
  ChevronsDownUp,
  Clock,
  CloudSun,
  Eye,
  Mountain,
  Shapes,
  Ship,
  Thermometer,
  ThermometerSun,
  Waves,
  WavesArrowDown,
  WavesArrowUp,
  Weight,
  Wind,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { UnitNumberInput } from "@/components/unit-number-input";
import { Textarea } from "@/components/ui/textarea";
import { DiveStartTimeField } from "@/components/dives/dive-start-time-field";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  MixtureFieldArray,
  MixtureFields,
} from "@/components/dives/mixture-fields";
import { TripCombobox } from "@/components/dives/trip-combobox";
import { CourseCombobox } from "@/components/courses/course-combobox";
import { ContactCombobox } from "@/components/contacts/contact-combobox";
import type { ContactRole } from "@/lib/api/contacts";
import { PeopleMultiSelect } from "@/components/people/people-multi-select";
import type { PersonReference } from "@/lib/api/people";
import { DiveSiteMultiSelect } from "@/components/dives/dive-site-multi-select";
import { useDiveRoster } from "@/components/dives/use-dive-roster";
import { DiveGearField } from "@/components/gear/dive-gear-field";
import {
  SpeciesMultiSelect,
  type SightingErrors,
} from "@/components/dives/species-multi-select";
import { DiveVocabularyField } from "@/components/dives/dive-vocabulary-field";
import { RatingInput } from "@/components/dives/rating-input";
import { TagsMultiSelect } from "@/components/dives/tags-multi-select";
import { DiveMixtureInput, type SightingInput } from "@/lib/validations/dive";
import {
  CURRENT_LABELS,
  CURRENTS,
  DIVE_TYPE_LABELS,
  DIVE_TYPES,
  DiveSiteSummary,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  WATER_TYPES,
  WATER_TYPE_LABELS,
  WAVES,
  WAVES_LABELS,
  WEATHER,
  WEATHER_LABELS,
  type DiveCurrent,
  type DiveType,
  type DiveWaves,
  type DiveWeather,
  type EntryType,
  type WaterType,
} from "@/lib/api/dives";
import { GearItemSummary } from "@/lib/api/gear";
import { SpeciesSummary } from "@/lib/api/species";
import { useEntryUnits } from "@/hooks/useEntryUnits";
import { EntryUnitLabelRow } from "@/components/entry-unit-toggle";
import { unitLabel } from "@/lib/units";
import type {
  DiveFormFieldGroup,
  DiveFormFieldKey,
} from "@/lib/dive-form-fields";
import type { DiveFormVisibility } from "@/hooks/useDiveFormVisibility";
import { DiveFormSection } from "@/components/dives/dive-form-section";

// Freediving and snorkeling stay in the vocabulary, which a stored dive can hold,
// but the form does not offer them yet.
const OFFERED_DIVE_TYPES = DIVE_TYPES.filter(
  (type) => type !== "freedive" && type !== "snorkel",
);

// What a contact created from the dive form starts as.
const DIVE_CENTER: readonly ContactRole[] = ["dive_center"];

// What each sighting's inputs were refused for, by row, out of the field's error -
// which for a list is an array of per-row errors with no message of its own.
function sightingErrors(
  error: unknown,
): (SightingErrors | undefined)[] | undefined {
  if (!Array.isArray(error)) return undefined;
  return error.map(
    (row) => row && { count: row.count?.message, notes: row.notes?.message },
  );
}

// The field shape shared by both `DiveCreateInput` and `DiveUpdateInput`
// (see `lib/validations/dive.ts`): the create schema's fields, all optional
// (the update schema optionalizes every field, since a PATCH only needs to
// send what changed). Both concrete form input types are structurally
// assignable to this, so `DiveFormFields`/`MixtureFields` can stay generic
// over `TFieldValues` instead of falling back to `Control<any, any, any>`,
// which erased type safety between the create/update form shapes entirely.
export interface DiveFormValues extends FieldValues {
  dive_number?: number;
  // ISO 8601, e.g. "2021-04-04T10:04:47+02:00" - the dive's own original
  // timezone, not the viewer's browser, and on an imported dive possibly no
  // timezone at all ("2026-04-17T11:49:23"). Edited via `DiveStartTimeField`,
  // which is the only place that splits/recombines it into the wall-clock +
  // offset pair its two underlying inputs actually edit - see
  // `lib/date-time.ts`.
  start_time?: string;
  duration?: string;
  max_depth?: number | null;
  avg_depth?: number | null;
  bottom_temperature?: number | null;
  visibility?: number | null;
  // `""` is the "Not recorded" option, and the live cleared state - never
  // `undefined`, which react-hook-form re-displays the field's default for.
  // `null` is what the submit path converts it to; both are in the union
  // because `diveToFormValues` seeds one and `buildDiveUpdate` reads the other.
  water_type?: WaterType | "" | null;
  altitude?: number | null;
  // The same three states for every other select, and `""` for a boat name
  // nobody typed.
  type?: DiveType | "" | null;
  current?: DiveCurrent | "" | null;
  waves?: DiveWaves | "" | null;
  weather?: DiveWeather | "" | null;
  entry_type?: EntryType | "" | null;
  boat_name?: string;
  air_temperature?: number | null;
  // `null` is unrated, which the control's clear writes.
  rating?: number | null;
  weight?: number | null;
  // `null` means "no trip", and is distinct from `undefined` ("field not
  // touched") on the edit form - see `DiveUpdate.trip_uuid`.
  trip_uuid?: string | null;
  // Same three states, same reason, for the training course this dive was on.
  course_uuid?: string | null;
  // And for the dive center that ran it.
  contact_uuid?: string | null;
  // Who the diver was with, each with their role on this dive.
  people?: PersonReference[];
  dive_site_uuids?: string[];
  gear_item_uuids?: string[];
  sightings?: SightingInput[];
  // By name, in the diver's order.
  tags?: string[];
  notes?: string;
  mixtures?: DiveMixtureInput[];
}

export interface DiveFormFieldsProps<TFieldValues extends DiveFormValues> {
  control: Control<TFieldValues>;
  // In "create" mode, dive number/start time/duration are required by the
  // schema and marked with a "*" in the UI. In "edit" mode these fields are
  // optional at the schema level (a PATCH only needs to send what changed),
  // so no asterisks are shown and a cleared value resolves to `undefined`
  // rather than falling back to a default.
  mode: "create" | "edit";
  // Which of the optional fields this form renders at all. A hidden field's
  // `FormField` is not rendered, so its input is out of the DOM, the tab order and
  // the accessibility tree - and its *value* is untouched by that, which is
  // react-hook-form's `shouldUnregister: false` default doing the work.
  visibility: DiveFormVisibility;
  // Created once by the page (alongside `form`/`control`) and also passed to
  // `DiveFileImport` - see `MixtureFieldArray`'s own doc comment for why this
  // can't just be created internally by `MixtureFields`.
  mixtureFieldArray: MixtureFieldArray;
  // The dive's existing sites, when editing. The site picker no longer loads
  // the user's whole catalogue, so it can't look a selected uuid's name up
  // locally - passing the ones already on the record saves it a request each.
  knownDiveSites?: DiveSiteSummary[];
  // Same idea for gear: `Dive.gear_items` already carries what a picked row
  // renders, so the picker needn't fetch each item back by uuid.
  knownGearItems?: GearItemSummary[];
  // And for species: `Dive.sightings` carries the names the picker's rows need,
  // so an edit form starts out labelled without a lookup per row.
  knownSpecies?: SpeciesSummary[];
  // Raised by the species picker while a pick is still being resolved into a
  // catalog row - see `SpeciesMultiSelect.onPendingChange`. Owned by
  // `DiveForm`, which is where the submit button that must wait for it is.
  onSpeciesPendingChange?: (isPending: boolean) => void;
  // A note shown under the dive number, but only while the field still holds
  // `forValue`. Carried as a value rather than a ready-made string so the
  // "still showing it?" check can happen inside the field's own render, where
  // the current value is already reactive - the alternative, a `form.watch` in
  // the page, opts that whole component out of compiler memoization.
  //
  // Currently only the create form sets it, to say the suggested number is
  // already in use (see `useSuggestedDiveNumber`). A note rather than a
  // validation error on purpose: duplicates are a normal state while
  // back-filling a log, reconciled later with Renumber, so this must not block
  // a save.
  diveNumberNotice?: { forValue: number; message: string } | null;
  // Owned by `DiveForm`, whose failed-submit path opens the sections an error
  // landed in.
  collapsedGroups: ReadonlySet<DiveFormFieldGroup>;
  onGroupOpenChange: (group: DiveFormFieldGroup, open: boolean) => void;
}

export function DiveFormFields<TFieldValues extends DiveFormValues>({
  control,
  mode,
  visibility,
  mixtureFieldArray,
  knownDiveSites,
  knownGearItems,
  knownSpecies,
  onSpeciesPendingChange,
  diveNumberNotice,
  collapsedGroups,
  onGroupOpenChange,
}: DiveFormFieldsProps<TFieldValues>) {
  const required = mode === "create";
  const requiredMark = required ? " *" : "";
  // Read once here and handed to the labels and the number boxes below, per
  // dimension: the account preference unless the diver has flipped that dimension
  // with the toggle in its label row. Form state itself stays metric whatever
  // this says - see `UnitNumberInput`.
  const { entryUnits, toggleEntryUnits } = useEntryUnits();
  const isVisible = visibility.isVisible;
  // The rating is a group, which a label names by reference rather than by `for`.
  const ratingLabelId = useId();
  // Offered for a boat entry, and kept on screen whenever it holds a name - typed
  // before the entry changed, or stored - so a name is never both kept and out of
  // reach. Submitted like any other field.
  const [entryType, boatName] = useWatch({
    control,
    name: ["entry_type", "boat_name"] as Path<TFieldValues>[],
  });
  const showBoatName =
    isVisible("boat_name") && (entryType === "boat" || Boolean(boatName));
  // The lookup pickers below rank their rows by last use at or before the dive's
  // own start time, sent as the field holds it; an empty field sends no bound.
  // The species picker takes no bound - a site's species belong to the place, not
  // to the date - and lists the species logged at the dive's sites first.
  const [startTime, tripUuid, courseUuid, diveSiteUuids] = useWatch({
    control,
    name: [
      "start_time",
      "trip_uuid",
      "course_uuid",
      "dive_site_uuids",
    ] as Path<TFieldValues>[],
  });
  const until: string | undefined = startTime || undefined;
  const roster = useDiveRoster(tripUuid, courseUuid);
  const section = (group: DiveFormFieldGroup, children: ReactNode) => (
    <DiveFormSection
      title={group}
      open={!collapsedGroups.has(group)}
      onOpenChange={(open) => onGroupOpenChange(group, open)}
    >
      {children}
    </DiveFormSection>
  );

  // Every field with a unit carries its own toggle, and the fields of one dimension
  // share it: flipping Maximum depth flips Average depth too, since both read the one
  // setting `useEntryUnits` keeps per dimension.
  const unitLabelRow = (
    dimension: "depth" | "temperature",
    label: ReactNode,
  ): ReactNode => (
    <EntryUnitLabelRow
      dimension={dimension}
      entryUnits={entryUnits(dimension)}
      onToggle={() => toggleEntryUnits(dimension)}
    >
      {label}
    </EntryUnitLabelRow>
  );

  return (
    // A fragment, so each section is a card in the form's own stack.
    <>
      {isVisible("course_uuid") &&
        section(
          "Training",
          <FormField
            control={control}
            name={"course_uuid" as Path<TFieldValues>}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Course</FormLabel>
                <FormControl>
                  <CourseCombobox
                    value={field.value}
                    onChange={field.onChange}
                    until={until}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />,
        )}

      {(isVisible("trip_uuid") ||
        isVisible("contact_uuid") ||
        isVisible("dive_site_uuids") ||
        isVisible("entry_type") ||
        showBoatName) &&
        section(
          "Location",
          <>
            {isVisible("trip_uuid") && (
              <FormField
                control={control}
                name={"trip_uuid" as Path<TFieldValues>}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trip</FormLabel>
                    <FormControl>
                      <TripCombobox
                        value={field.value}
                        onChange={field.onChange}
                        until={until}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {isVisible("contact_uuid") && (
              <FormField
                control={control}
                name={"contact_uuid" as Path<TFieldValues>}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dive center</FormLabel>
                    <FormControl>
                      <ContactCombobox
                        value={field.value}
                        onChange={field.onChange}
                        until={until}
                        pinnedUuids={roster.contacts}
                        initialRoles={DIVE_CENTER}
                        placeholder="Select a dive center..."
                        addNewLabel="Add dive center..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Dive Site(s) */}
            {isVisible("dive_site_uuids") && (
              <FormField
                control={control}
                name={"dive_site_uuids" as Path<TFieldValues>}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dive site(s)</FormLabel>
                    <FormControl>
                      <DiveSiteMultiSelect
                        value={field.value ?? []}
                        knownSites={knownDiveSites}
                        onChange={field.onChange}
                        until={until}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* How the diver got in, under where: a property of the site as much as
                of the dive. The boat name beside it - see `showBoatName`. */}
            {(isVisible("entry_type") || showBoatName) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isVisible("entry_type") && (
                  <DiveVocabularyField
                    control={control}
                    name={"entry_type" as Path<TFieldValues>}
                    label="Entry type"
                    icon={WavesArrowDown}
                    values={ENTRY_TYPES}
                    labels={ENTRY_TYPE_LABELS}
                  />
                )}
                {showBoatName && (
                  <FormField
                    control={control}
                    name={"boat_name" as Path<TFieldValues>}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Boat name</FormLabel>
                        <div className="relative">
                          <Ship className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                          <FormControl>
                            {/* `""` is not recorded, and the submit paths trim it into
                      the API's `null` - see `boatNameOrNull`. */}
                            <Input
                              type="text"
                              placeholder="e.g. Legend"
                              className="pl-9"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )}
          </>,
        )}

      {/* A person picked here is a buddy until the diver says otherwise. */}
      {isVisible("people") &&
        section(
          "People",
          <FormField
            control={control}
            name={"people" as Path<TFieldValues>}
            render={({ field }) => (
              <FormItem>
                <FormLabel>People</FormLabel>
                <FormControl>
                  <PeopleMultiSelect
                    value={field.value ?? []}
                    onChange={field.onChange}
                    defaultRole="buddy"
                    until={until}
                    pinnedUuids={roster.people}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />,
        )}

      {section(
        "Dive info",
        <>
          {/* What kind of dive it was, first: it frames every fact below it. Half
          width in a grid of its own, for the reason Weight is: a select as wide as
          the form is wider than anything it offers. */}
          {isVisible("type") && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DiveVocabularyField
                control={control}
                name={"type" as Path<TFieldValues>}
                label="Dive type"
                icon={Shapes}
                values={OFFERED_DIVE_TYPES}
                labels={DIVE_TYPE_LABELS}
              />
            </div>
          )}

          {/* Date and Time */}
          <FormField
            control={control}
            name={"start_time" as Path<TFieldValues>}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start time{requiredMark}</FormLabel>
                <FormControl>
                  <DiveStartTimeField
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Dive number & Duration. Paired because both are always rendered -
          neither is in the Fields dialog - so this row is the one pair no
          visibility choice can break, and neither field has to sit half-width
          beside a hole. Dive number was alone in a grid of its own until then,
          for the column width: full width would make the form's one
          always-present field its widest, and a number box is the last thing
          that should be. The pair keeps that width without the empty column.

          Unequal heights are expected here: `diveNumberNotice` adds a line
          under the number when the suggestion is already taken, and Duration
          has nothing to match it with. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={control}
              name={"dive_number" as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dive number{requiredMark}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        // `parseInt(...) || 1` looked equivalent and wasn't: `||`
                        // treats an emptied box (NaN) and a typed 0 alike, so
                        // clearing the field instantly rewrote it to 1. That write
                        // also marked the field dirty, and `useSuggestedDiveNumber`
                        // reads `isDirty` as its permanent "the diver chose a
                        // number" latch - so one accidental clear stopped the
                        // number following the date for the rest of the form's
                        // life, including after a file import changed the date.
                        // An emptied box must stay empty and let the schema speak.
                        const parsed = parseInt(e.target.value, 10);
                        field.onChange(
                          Number.isNaN(parsed) ? undefined : parsed,
                        );
                      }}
                    />
                  </FormControl>
                  {diveNumberNotice &&
                  field.value === diveNumberNotice.forValue ? (
                    <FormDescription>
                      {diveNumberNotice.message}
                    </FormDescription>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name={"duration" as Path<TFieldValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration{requiredMark}</FormLabel>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="e.g. 45 or 67:30"
                        className="pl-9"
                        {...field}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* The depths, the pair that closes the dive's own facts. A lone survivor
          sits half-width rather than spanning: see the readings grid below. */}
          {(isVisible("max_depth") || isVisible("avg_depth")) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isVisible("max_depth") && (
                <FormField
                  control={control}
                  name={"max_depth" as Path<TFieldValues>}
                  render={({ field }) => (
                    <FormItem>
                      {unitLabelRow(
                        "depth",
                        <FormLabel>
                          Maximum depth (
                          {unitLabel("depth", entryUnits("depth"))})
                        </FormLabel>,
                      )}
                      <div className="relative">
                        <ArrowDownToLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                        <FormControl>
                          <UnitNumberInput
                            dimension="depth"
                            units={entryUnits("depth")}
                            min={0}
                            placeholderValue={30.52}
                            className="pl-9"
                            {...field}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isVisible("avg_depth") && (
                <FormField
                  control={control}
                  name={"avg_depth" as Path<TFieldValues>}
                  render={({ field }) => (
                    <FormItem>
                      {unitLabelRow(
                        "depth",
                        <FormLabel>
                          Average depth (
                          {unitLabel("depth", entryUnits("depth"))})
                        </FormLabel>,
                      )}
                      <div className="relative">
                        <ChevronsDownUp className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                        <FormControl>
                          <UnitNumberInput
                            dimension="depth"
                            units={entryUnits("depth")}
                            min={0}
                            placeholderValue={18.24}
                            className="pl-9"
                            {...field}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          )}
        </>,
      )}

      {(isVisible("bottom_temperature") ||
        isVisible("air_temperature") ||
        isVisible("visibility") ||
        isVisible("water_type") ||
        isVisible("altitude") ||
        isVisible("current") ||
        isVisible("waves") ||
        isVisible("weather")) &&
        section(
          "Environment",
          <>
            {/* The readings. One grid rather than fixed pairs, because every one of
          them hides on its own. Paired up, hiding half of a pair left the other
          half in its column with an empty one beside it, which reads as a field
          that failed to load; a single grid lets auto-flow pack whatever
          survives from the left, so a hidden field costs a slot and not a hole.
          The fields follow the Fields dialog's order, two to a row.

          An odd number visible leaves one field half-width on the last row.
          That is accepted and deliberately not spanned: a ragged bottom edge
          reads as the end of a list, a gap in the middle reads as breakage.

          `gap-y-6` rather than `gap-4`'s 1rem, because the row gap is the
          section's own `space-y-6` rhythm, not a pair's: a full row sits exactly
          where a pair of its own would. The column gap is still 1rem. On a
          phone the fields stack at 1.5rem - one grid has one row gap. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
              {isVisible("bottom_temperature") && (
                <FormField
                  control={control}
                  name={"bottom_temperature" as Path<TFieldValues>}
                  render={({ field }) => (
                    <FormItem>
                      {unitLabelRow(
                        "temperature",
                        <FormLabel>
                          Bottom temperature (
                          {unitLabel("temperature", entryUnits("temperature"))})
                        </FormLabel>,
                      )}
                      <div className="relative">
                        <Thermometer className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                        <FormControl>
                          {/* The 2-decimal entry rounding this field has always done is
                      now the component's, and every float sibling above and
                      below gets it too. */}
                          <UnitNumberInput
                            dimension="temperature"
                            units={entryUnits("temperature")}
                            min={-50}
                            max={50}
                            placeholderValue={22.5}
                            className="pl-9"
                            {...field}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isVisible("visibility") && (
                <FormField
                  control={control}
                  name={"visibility" as Path<TFieldValues>}
                  render={({ field }) => (
                    <FormItem>
                      <EntryUnitLabelRow
                        dimension="visibility"
                        entryUnits={entryUnits("visibility")}
                        onToggle={() => toggleEntryUnits("visibility")}
                      >
                        <FormLabel>
                          Visibility (
                          {unitLabel("visibility", entryUnits("visibility"))})
                        </FormLabel>
                      </EntryUnitLabelRow>
                      <div className="relative">
                        <Eye className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                        <FormControl>
                          {/* An `Integer` column, so feet commit whole metres: 50 ft is
                      stored as 15 m and reads back as 49 ft. Accepted - see
                      DECISIONS.md - because visibility is an estimate and
                      whole-metre resolution is finer than anyone judges it to. */}
                          <UnitNumberInput
                            dimension="visibility"
                            units={entryUnits("visibility")}
                            min={0}
                            placeholderValue={15}
                            className="pl-9"
                            {...field}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {/* Water and altitude - what the water was and where it was, which the
                  computer treats as calibration settings and the log treats as facts
                  about the dive. */}
              {isVisible("water_type") && (
                <DiveVocabularyField
                  control={control}
                  name={"water_type" as Path<TFieldValues>}
                  label="Water type"
                  icon={Waves}
                  values={WATER_TYPES}
                  labels={WATER_TYPE_LABELS}
                />
              )}
              {isVisible("altitude") && (
                <FormField
                  control={control}
                  name={"altitude" as Path<TFieldValues>}
                  render={({ field }) => (
                    <FormItem>
                      <EntryUnitLabelRow
                        dimension="altitude"
                        entryUnits={entryUnits("altitude")}
                        onToggle={() => toggleEntryUnits("altitude")}
                      >
                        <FormLabel>
                          Altitude (
                          {unitLabel("altitude", entryUnits("altitude"))})
                        </FormLabel>
                      </EntryUnitLabelRow>
                      <div className="relative">
                        <Mountain className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                        <FormControl>
                          {/* Bounds declared in metres, which is what the Zod schema and
                      the DB `CHECK` behind it are written in; the component
                      converts them inward for the spinner, so what the arrows
                      offer is always something the schema will accept. */}
                          <UnitNumberInput
                            dimension="altitude"
                            units={entryUnits("altitude")}
                            // Not Visibility's `min={0}`, which this box otherwise
                            // copies: the Dead Sea is below sea level and admitting it
                            // is the whole reason the API's bound is -450 rather than 0.
                            min={-450}
                            max={6500}
                            placeholderValue={372}
                            className="pl-9"
                            {...field}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {/* Then up from the water: the surface, and the air above it. */}
              {isVisible("waves") && (
                <DiveVocabularyField
                  control={control}
                  name={"waves" as Path<TFieldValues>}
                  label="Waves"
                  icon={WavesArrowUp}
                  values={WAVES}
                  labels={WAVES_LABELS}
                />
              )}
              {isVisible("current") && (
                <DiveVocabularyField
                  control={control}
                  name={"current" as Path<TFieldValues>}
                  label="Current"
                  icon={Wind}
                  values={CURRENTS}
                  labels={CURRENT_LABELS}
                />
              )}
              {isVisible("weather") && (
                <DiveVocabularyField
                  control={control}
                  name={"weather" as Path<TFieldValues>}
                  label="Weather"
                  icon={CloudSun}
                  values={WEATHER}
                  labels={WEATHER_LABELS}
                />
              )}

              {isVisible("air_temperature") && (
                <FormField
                  control={control}
                  name={"air_temperature" as Path<TFieldValues>}
                  render={({ field }) => (
                    <FormItem>
                      {unitLabelRow(
                        "temperature",
                        <FormLabel>
                          Air temperature (
                          {unitLabel("temperature", entryUnits("temperature"))})
                        </FormLabel>,
                      )}
                      <div className="relative">
                        <ThermometerSun className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                        <FormControl>
                          <UnitNumberInput
                            dimension="temperature"
                            units={entryUnits("temperature")}
                            min={-60}
                            max={60}
                            placeholderValue={28}
                            className="pl-9"
                            {...field}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </>,
        )}

      {/* Tanks. Hidden, the whole section goes - the heading, every tank card,
          "Add tank" and the empty-state line - while the cylinders themselves stay
          in form state and are submitted, exactly as a hidden scalar is. */}
      {isVisible("mixtures") &&
        section(
          "Tanks",
          <MixtureFields<TFieldValues>
            control={control}
            fieldArray={mixtureFieldArray}
            isVisible={isVisible}
            until={until}
          />,
        )}

      {/* Gear, weight included - grouped as "how the diver was configured for this
          dive", as opposed to the environment readings above. Weight is a plain
          per-dive number rather than one of the gear items (see DECISIONS.md),
          but it belongs next to them here.

          The two are nested rather than rendered side by side because loading a
          gear set fills in *both*: `DiveGearField` needs the weight field's
          value and setter, and nesting is what puts them in scope without
          registering `weight` twice.

          They still hide independently, and the nesting is what makes that cheap:
          the outer `FormField` is a render prop rather than an input, so each half
          is gated on its own key inside it and `weight` is registered exactly once
          however many of the two are on screen. The pair is skipped altogether when
          neither is - `weight`'s value survives that, which is
          `shouldUnregister: false`. */}
      {(isVisible("gear_item_uuids") || isVisible("weight")) &&
        section(
          "Gear",
          <FormField
            control={control}
            name={"weight" as Path<TFieldValues>}
            render={({ field: weightField }) => (
              <div className="space-y-6">
                {isVisible("gear_item_uuids") && (
                  <FormField
                    control={control}
                    name={"gear_item_uuids" as Path<TFieldValues>}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gear</FormLabel>
                        <FormControl>
                          <DiveGearField
                            value={field.value ?? []}
                            knownItems={knownGearItems}
                            onChange={field.onChange}
                            until={until}
                            weight={weightField.value ?? null}
                            onWeightChange={weightField.onChange}
                            // One of the moments a value arrives from outside the
                            // diver's typing: a set that carries a weight fills the
                            // box, so the box has to be on screen to be seen and changed.
                            onSetApplied={(set) => {
                              const revealed: DiveFormFieldKey[] = [];
                              if (set.gear_items.length > 0) {
                                revealed.push("gear_item_uuids");
                              }
                              if (set.weight != null) revealed.push("weight");
                              visibility.reveal(revealed);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {isVisible("weight") && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormItem>
                      {/* Weight is the one dimension with a second toggle elsewhere:
                    the gear-set dialog opens from inside this form and enters a
                    weight of its own. Both read the same store, so the two never
                    disagree, and Radix's modal `aria-hidden` keeps only one of
                    them exposed at a time. */}
                      <EntryUnitLabelRow
                        dimension="weight"
                        entryUnits={entryUnits("weight")}
                        onToggle={() => toggleEntryUnits("weight")}
                      >
                        <FormLabel>
                          Weight ({unitLabel("weight", entryUnits("weight"))})
                        </FormLabel>
                      </EntryUnitLabelRow>
                      <div className="relative">
                        <Weight className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                        <FormControl>
                          <UnitNumberInput
                            dimension="weight"
                            units={entryUnits("weight")}
                            min={0}
                            placeholderValue={6}
                            className="pl-9"
                            {...weightField}
                            value={weightField.value}
                            onChange={weightField.onChange}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  </div>
                )}
              </div>
            )}
          />,
        )}

      {/* Species spotted - after the kit and before the notes, which is where
          the dive page's own card sits: what was seen is an observation about
          the dive, and the notes underneath are where anything this picker
          can't name ends up. */}
      {isVisible("sightings") &&
        section(
          "Marine life",
          <FormField
            control={control}
            name={"sightings" as Path<TFieldValues>}
            render={({ field, fieldState }) => (
              // No `FormMessage`: it would print that array's missing message as
              // "undefined". Each row shows its own.
              <FormItem>
                <FormLabel>Species spotted</FormLabel>
                <FormControl>
                  <SpeciesMultiSelect
                    value={field.value ?? []}
                    knownSpecies={knownSpecies}
                    diveSiteUuids={diveSiteUuids}
                    onChange={field.onChange}
                    errors={sightingErrors(fieldState.error)}
                    onPendingChange={onSpeciesPendingChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />,
        )}

      {/* The diver's own word on the dive: how it rated, what it is filed
          under, and the notes - the order the dive page reads them in. */}
      {(isVisible("rating") || isVisible("tags") || isVisible("notes")) &&
        section(
          "Notes",
          <>
            {isVisible("rating") && (
              <FormField
                control={control}
                name={"rating" as Path<TFieldValues>}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel id={ratingLabelId}>Rating</FormLabel>
                    <FormControl>
                      <RatingInput
                        aria-labelledby={ratingLabelId}
                        value={field.value ?? null}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {isVisible("tags") && (
              <FormField
                control={control}
                name={"tags" as Path<TFieldValues>}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <TagsMultiSelect
                        value={field.value ?? []}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {isVisible("notes") && (
              <FormField
                control={control}
                name={"notes" as Path<TFieldValues>}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter any additional notes about your dive..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </>,
        )}
    </>
  );
}
