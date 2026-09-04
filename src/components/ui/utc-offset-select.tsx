"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatUtcOffset } from "@/lib/date-time";

// Every UTC offset in real-world use falls on a 15-minute boundary between
// -12:00 (International Date Line West) and +14:00 (Kiribati) - e.g. India
// (+05:30), Nepal (+05:45), the Chatham Islands (+12:45). Generating the full
// range at that granularity (rather than hand-picking "common" ones) means
// this list never needs updating as new dive-computer exports show up.
const MIN_OFFSET_MINUTES = -12 * 60;
const MAX_OFFSET_MINUTES = 14 * 60;
const OFFSET_STEP_MINUTES = 15;

const OFFSET_OPTIONS: number[] = [];
for (
  let minutes = MIN_OFFSET_MINUTES;
  minutes <= MAX_OFFSET_MINUTES;
  minutes += OFFSET_STEP_MINUTES
) {
  OFFSET_OPTIONS.push(minutes);
}

// The value "Not recorded" carries in the DOM. A `Select` is a string-valued
// control and Radix reserves `""` for "nothing selected", so the unknown state
// needs a sentinel of its own - it is a real choice, not the absence of one.
// Never sent anywhere: `UtcOffsetSelect` maps it back to `null` at this
// boundary, and `null` is what the rest of the app speaks.
const UNKNOWN_OFFSET_VALUE = "unknown";

export interface UtcOffsetSelectProps {
  // `null` is "not recorded" - the dive's own zone was never captured. Distinct
  // from `undefined`, which is a field with nothing in it yet.
  value?: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  // Offers "Not recorded" as a choice at all. Only ever true while editing a
  // dive whose offset is *already* unknown, which is why it is opt-in rather
  // than the default: the API refuses to remove an offset from a dive that has
  // one, so offering it anywhere else would be a control that cannot do what it
  // says. Import is the only thing that creates the state.
  allowUnknown?: boolean;
}

// Picks the UTC offset (in minutes) a dive's `start_time` was logged in -
// e.g. "UTC+02:00" for a dive computer set to Central European Summer Time.
// This is the dive's *own* original timezone, not the viewer's - see the
// "UTC-offset-aware dive `start_time` helpers" section of `lib/date-time.ts`.
export function UtcOffsetSelect({
  value,
  onChange,
  disabled,
  allowUnknown = false,
}: UtcOffsetSelectProps) {
  const selected =
    value === null
      ? UNKNOWN_OFFSET_VALUE
      : value !== undefined
        ? String(value)
        : undefined;

  return (
    <Select
      value={selected}
      onValueChange={(next) =>
        onChange(next === UNKNOWN_OFFSET_VALUE ? null : Number(next))
      }
      disabled={disabled}
    >
      <SelectTrigger aria-label="UTC offset">
        <SelectValue placeholder="UTC offset" />
      </SelectTrigger>
      <SelectContent>
        {/* First, not last: it is the state the dive is already in whenever this
            option exists at all, so it is what the trigger is showing. */}
        {allowUnknown && (
          <SelectItem value={UNKNOWN_OFFSET_VALUE}>Not recorded</SelectItem>
        )}
        {OFFSET_OPTIONS.map((minutes) => (
          <SelectItem key={minutes} value={String(minutes)}>
            UTC{formatUtcOffset(minutes)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
