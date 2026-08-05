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

export interface UtcOffsetSelectProps {
  value?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

// Picks the UTC offset (in minutes) a dive's `start_time` was logged in -
// e.g. "UTC+02:00" for a dive computer set to Central European Summer Time.
// This is the dive's *own* original timezone, not the viewer's - see the
// "UTC-offset-aware dive `start_time` helpers" section of `lib/date-time.ts`.
export function UtcOffsetSelect({
  value,
  onChange,
  disabled,
}: UtcOffsetSelectProps) {
  return (
    <Select
      value={value !== undefined ? String(value) : undefined}
      onValueChange={(next) => onChange(Number(next))}
      disabled={disabled}
    >
      <SelectTrigger aria-label="UTC offset">
        <SelectValue placeholder="UTC offset" />
      </SelectTrigger>
      <SelectContent>
        {OFFSET_OPTIONS.map((minutes) => (
          <SelectItem key={minutes} value={String(minutes)}>
            UTC{formatUtcOffset(minutes)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
