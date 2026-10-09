"use client";

import { NativeSelect } from "@/components/ui/native-select";
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
  return (
    <NativeSelect
      aria-label="UTC offset"
      // `""` is "Not recorded" where that is offered, and otherwise the
      // placeholder of a field with nothing in it yet.
      value={value == null ? "" : String(value)}
      onChange={(e) =>
        onChange(e.target.value === "" ? null : Number(e.target.value))
      }
      disabled={disabled}
    >
      {/* First, not last: it is the state the dive is already in whenever this
          option exists at all, so it is what the box is showing. */}
      {allowUnknown ? (
        <option value="">Not recorded</option>
      ) : (
        value == null && (
          <option value="" disabled hidden>
            UTC offset
          </option>
        )
      )}
      {OFFSET_OPTIONS.map((minutes) => (
        <option key={minutes} value={minutes}>
          UTC{formatUtcOffset(minutes)}
        </option>
      ))}
    </NativeSelect>
  );
}
