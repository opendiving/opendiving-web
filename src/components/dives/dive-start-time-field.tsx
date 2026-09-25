"use client";

import { useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { UtcOffsetSelect } from "@/components/ui/utc-offset-select";
import {
  combineStartTime,
  getBrowserUtcOffsetMinutes,
  isDateOnlyStartTime,
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
  //
  // Or it may be a bare date ("2002-06-18"): a dive whose time of day was never
  // recorded. That renders as a date, an empty time and no offset - see
  // `DateOnlyStartTimeField` below.
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
  // Sticky for the life of the form: typing a time ends the date-only state, and
  // swapping the controls at that keystroke would take the time box out from
  // under the diver's cursor. Adjusted during render, since the edit form's
  // value arrives after mount.
  const [dateOnlyLayout, setDateOnlyLayout] = useState(
    isDateOnlyStartTime(value),
  );
  if (!dateOnlyLayout && isDateOnlyStartTime(value)) setDateOnlyLayout(true);
  if (dateOnlyLayout) {
    return (
      <DateOnlyStartTimeField
        {...slotProps}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

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
        // An emptied box is no start time: `combineStartTime("", 120)` is the
        // bare string "+02:00", which reads back as an unparseable date. The
        // offset select below already guards the mirror case.
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

// "HH:mm" as the OS time controls hand it back, padded to "HH:mm:ss"; `""` for a
// time box that is empty or only partly filled in.
function withSeconds(time: string): string {
  const match = time.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return "";
  const [, hours, minutes, seconds] = match;
  return `${hours}:${minutes}:${seconds ?? "00"}`;
}

// A dive that arrived with only its date. The date stays editable and stays
// bare - the API keeps the state for a bare `start_time` on such a dive - while
// the time box starts empty rather than at a midnight nobody recorded. Typing a
// time turns the value into a date-time with no offset, which the API accepts
// and which ends the state; only then is there a clock for the offset select to
// qualify. Emptying the time again returns to the bare date.
function DateOnlyStartTimeField({
  value,
  onChange,
  disabled,
  ...slotProps
}: DiveStartTimeFieldProps) {
  // An emptied date box is `""`, and stays in this layout: picking a date again
  // gives the bare date back rather than a date-time in the browser's zone.
  const { localDateTime, offsetMinutes } = value
    ? splitStartTime(value)
    : { localDateTime: "", offsetMinutes: null };
  const date = localDateTime.slice(0, 10);
  const time = localDateTime.slice(11);

  // What the time box shows: the committed time, or a partial one the diver is
  // still typing, which the native control reports as `""`. Re-synced during
  // render, as `NativeDateTimePicker` does.
  const [heldTime, setHeldTime] = useState(time);
  const [syncedValue, setSyncedValue] = useState(value ?? "");
  if (syncedValue !== (value ?? "")) {
    setSyncedValue(value ?? "");
    setHeldTime(time);
  }

  const withTime = (
    nextDate: string,
    nextTime: string,
    offset: number | null,
  ) =>
    nextTime ? combineStartTime(`${nextDate} ${nextTime}`, offset) : nextDate;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div className="grid grid-cols-[3fr_2fr] gap-2">
        <DatePicker
          {...slotProps}
          value={date}
          onChange={(next) =>
            onChange(next ? withTime(next, time, offsetMinutes) : "")
          }
          disabled={disabled}
        />
        <Input
          type="time"
          step={1}
          aria-label="Time"
          value={heldTime}
          onChange={(e) => {
            setHeldTime(e.target.value);
            const next = withSeconds(e.target.value);
            // A partial entry reads as `""` too, so only a box that held a
            // committed time is taken back to the bare date by it.
            if (date && (next || time)) {
              onChange(withTime(date, next, offsetMinutes));
            }
          }}
          disabled={disabled}
        />
      </div>
      <UtcOffsetSelect
        value={offsetMinutes}
        onChange={(next) => time && onChange(withTime(date, time, next))}
        disabled={disabled || !time}
        allowUnknown={offsetMinutes === null}
      />
    </div>
  );
}
