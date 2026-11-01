"use client";

import type { ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  CERTIFICATION_AGENCIES,
  certificationAgencyLabel,
} from "@/lib/api/certifications";
import type { ContactRole } from "@/lib/api/contacts";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { DatePicker, rangeEndAfter } from "@/components/ui/date-picker";
import { ContactCombobox } from "@/components/contacts/contact-combobox";
import { PersonCombobox } from "@/components/people/person-combobox";

// What a contact created from a course or a card starts as: whoever ran the
// training.
const SCHOOL: readonly ContactRole[] = ["school"];

interface TrainingDateField {
  name: string;
  label: string;
}

interface TrainingFieldsProps {
  // A card always names its agency; a course run by a private instructor need
  // not, so its form offers "No agency" and stores `null`.
  agencyRequired: boolean;
  // The field sharing the agency's row.
  besideAgency: ReactNode;
  // Start, then end: the pickers treat the pair as a range.
  dates: readonly [TrainingDateField, TrainingDateField];
  // The date the pickers rank by last use at or before.
  until?: string;
  // Replaces the instructor field's own `onChange`, for a form that does more
  // when the instructor changes.
  onInstructorChange?: (uuid: string | null) => void;
}

// The block a course and a certification share: who ran the training, when, and
// who taught it. Both forms hold these under the same names - `agency`,
// `agency_other`, `contact_uuid`, `instructor_uuid`, `instructor_number` - and
// name their own pair of dates.
export function TrainingFields({
  agencyRequired,
  besideAgency,
  dates,
  until,
  onInstructorChange,
}: TrainingFieldsProps) {
  const { control, setValue } = useFormContext();
  // `agency_other` is only shown - and only accepted by the API - for "other".
  const agency = useWatch({ control, name: "agency" });
  const [startField, endField] = dates;
  const [start = "", end = ""] = useWatch({
    control,
    name: [startField.name, endField.name],
  }) as [string | undefined, string | undefined];

  const onStartChange = (value: string) => {
    const kept = rangeEndAfter(value, end);
    if (kept !== end) {
      setValue(endField.name, kept, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="agency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{agencyRequired ? "Agency *" : "Agency"}</FormLabel>
              <FormControl>
                <NativeSelect
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value || null)}
                >
                  {/* First, because it is what a course opens on, and the
                      state has to be pickable again after an agency has been
                      chosen. */}
                  {!agencyRequired && <option value="">No agency</option>}
                  {CERTIFICATION_AGENCIES.map((value) => (
                    <option key={value} value={value}>
                      {certificationAgencyLabel(value)}
                    </option>
                  ))}
                </NativeSelect>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {besideAgency}
      </div>

      {/* Under the row rather than inside it: it belongs to the agency box above
          and appears only for one of its values, so a third box arriving in the
          middle of a filled row is a worse surprise than a fourth line. */}
      {agency === "other" && (
        <FormField
          control={control}
          name="agency_other"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Agency name *</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. FFESSM"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Neither date is required: a course that is only booked has none yet,
          and most recreational cards never expire. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {dates.map(({ name, label }, position) => (
          <FormField
            key={name}
            control={control}
            name={name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{label}</FormLabel>
                <FormControl>
                  <DatePicker
                    value={field.value ?? ""}
                    onChange={(value) => {
                      field.onChange(value);
                      if (position === 0) onStartChange(value);
                    }}
                    rangeEnd={position === 0 ? end : undefined}
                    rangeStart={position === 1 ? start : undefined}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
      </div>

      <FormField
        control={control}
        name="contact_uuid"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Dive center</FormLabel>
            <FormControl>
              {/* Its dialog opens over this one, and over the certification
                  dialog too when a course is being added from there. */}
              <ContactCombobox
                value={field.value}
                onChange={field.onChange}
                until={until}
                initialRoles={SCHOOL}
                placeholder="Select a dive center..."
                addNewLabel="Add dive center..."
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="instructor_uuid"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Instructor</FormLabel>
              <FormControl>
                {/* A person, picked or typed: a name nobody has yet becomes one
                    on Enter, so naming a new instructor is still one step. */}
                <PersonCombobox
                  value={field.value}
                  onChange={onInstructorChange ?? field.onChange}
                  until={until}
                  placeholder="Select an instructor..."
                  addNewLabel="Add instructor..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="instructor_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Instructor number</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}
