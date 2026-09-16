"use client";

import { DateTimePicker } from "@/components/ui/date-time-picker";
import { UtcOffsetSelect } from "@/components/ui/utc-offset-select";
import {
  combineStartTime,
  getBrowserUtcOffsetMinutes,
  splitStartTime,
} from "@/lib/date-time";
import type { FormControlSlotProps } from "@/components/ui/form";

export interface DiveStartTimeFieldProps extends FormControlSlotProps {
  // An ISO 8601 string, e.g. "2021-04-04T10:04:47+02:00" - the same shape as the
  // API's `Dive.start_time` - or `""`/`undefined` while still empty (e.g. the
  // edit form before the dive has loaded).
  //
  // It may carry no offset ("2026-04-17T11:49:23"), which is a dive imported
  // from a DiveJSON document whose zone was never recorded. That is a state to
  // preserve, not a value to repair - see `lib/date-time.ts`.
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

// A date/time picker plus a UTC offset select, combined into the single
// `start_time` string the API expects - offset-aware, or carrying no offset
// where the dive's own zone was never recorded. This is the *only* place that
// splits/recombines that string into the wall-clock + offset pair the two
// underlying inputs actually edit (`splitStartTime()`/`combineStartTime()` in
// `lib/date-time.ts`) - every caller of this component (the dive create/edit
// forms, file import) only ever has to deal with one field, in exactly the
// format the API already uses.
export function DiveStartTimeField({
  value,
  onChange,
  disabled,
  // A composite field behind one "Start time" label, so the slot props go on the
  // *primary* control - the date/time picker. The offset select beside it carries
  // its own `aria-label`, since "Start time" would describe it only vaguely.
  ...slotProps
}: DiveStartTimeFieldProps) {
  // The browser's offset is reached only when there is no value at all - a brand
  // new dive, which `nowStartTime()` is about to give a real offset anyway. It is
  // never a *fallback* for a value that has none: that is the unknown state, and
  // `splitStartTime` hands it back as `null` for both controls to carry.
  const { localDateTime, offsetMinutes } = value
    ? splitStartTime(value)
    : { localDateTime: undefined, offsetMinutes: getBrowserUtcOffsetMinutes() };

  // Offered only while the value in hand has no offset, so it can never be used
  // to *remove* one: the moment the diver adopts a real offset the option is
  // gone, which is the API's rule (an offsetless `start_time` is accepted only on
  // a dive whose stored offset is already NULL) made true in the UI rather than
  // merely reported by a 422. The cost is that adopting an offset is one-way
  // within an unsaved edit - cancel and reopen the form to get back - and that is
  // the right way round for a state import is the sole origin of.
  const offsetUnknown = offsetMinutes === null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {/* Stays live while the offset is unknown, deliberately: the wall clock is
          the half that *was* recorded, so a typo in it is still the diver's to
          fix. The API accepts an offsetless `start_time` on such a dive and
          leaves the offset NULL, so this saves without inventing a zone. */}
      <DateTimePicker
        {...slotProps}
        value={localDateTime}
        // An emptied box is no start time, and stays `""` rather than being
        // combined: `combineStartTime("", 120)` is the bare string "+02:00",
        // which carries no time for `OFFSET_SUFFIX_REGEX` to anchor on and so
        // reads back as an offsetless value that `new Date()` cannot parse -
        // the field redraws as "NaN-NaN-NaN NaN:NaN:NaN" beside an offset that
        // has flipped itself to "Not recorded". The offset select below already
        // guards the mirror case.
        onChange={(next) =>
          onChange(next ? combineStartTime(next, offsetMinutes) : "")
        }
        disabled={disabled}
      />
      <UtcOffsetSelect
        value={offsetMinutes}
        onChange={(next) =>
          localDateTime && onChange(combineStartTime(localDateTime, next))
        }
        disabled={disabled}
        allowUnknown={offsetUnknown}
      />
    </div>
  );
}
