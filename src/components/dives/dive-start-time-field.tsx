"use client";

import { DateTimePicker } from "@/components/ui/date-time-picker";
import { UtcOffsetSelect } from "@/components/ui/utc-offset-select";
import {
  combineStartTime,
  getBrowserUtcOffsetMinutes,
  splitStartTime,
} from "@/lib/date-time";

export interface DiveStartTimeFieldProps {
  // An offset-aware ISO 8601 string, e.g. "2021-04-04T10:04:47+02:00" - the
  // same shape as the API's `Dive.start_time` - or `""`/`undefined` while
  // still empty (e.g. the edit form before the dive has loaded).
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

// A date/time picker plus a UTC offset select, combined into the single
// offset-aware `start_time` string the API expects. This is the *only* place
// that splits/recombines that string into the wall-clock + offset pair the
// two underlying inputs actually edit (`splitStartTime()`/`combineStartTime()`
// in `lib/date-time.ts`) - every caller of this component (the dive
// create/edit forms, file import) only ever has to deal with one field, in
// exactly the format the API already uses.
export function DiveStartTimeField({
  value,
  onChange,
  disabled,
}: DiveStartTimeFieldProps) {
  const { localDateTime, offsetMinutes } = value
    ? splitStartTime(value)
    : { localDateTime: undefined, offsetMinutes: getBrowserUtcOffsetMinutes() };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <DateTimePicker
        value={localDateTime}
        onChange={(next) => onChange(combineStartTime(next, offsetMinutes))}
        disabled={disabled}
      />
      <UtcOffsetSelect
        value={offsetMinutes}
        onChange={(next) =>
          localDateTime && onChange(combineStartTime(localDateTime, next))
        }
        disabled={disabled}
      />
    </div>
  );
}
