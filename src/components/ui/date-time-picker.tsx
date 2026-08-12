"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FormControlSlotProps } from "@/components/ui/form";

const DATE_TIME_REGEX = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseDateTime(value?: string): Date | undefined {
  if (!value) return undefined;
  const match = value.match(DATE_TIME_REGEX);
  if (!match) return undefined;
  const [, year, month, day, hours, minutes, seconds] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export interface DateTimePickerProps extends FormControlSlotProps {
  /** Value formatted as "YYYY-MM-DD HH:mm:ss" */
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "YYYY-MM-DD HH:mm:ss",
  disabled,
  ...slotProps
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selectedDate = parseDateTime(value);

  const [hours, setHours] = React.useState(pad(selectedDate?.getHours() ?? 0));
  const [minutes, setMinutes] = React.useState(
    pad(selectedDate?.getMinutes() ?? 0),
  );
  const [seconds, setSeconds] = React.useState(
    pad(selectedDate?.getSeconds() ?? 0),
  );

  // Keep the time fields in sync whenever the underlying value changes externally.
  // Not derived purely during render because handleTimeChange formats/clamps input
  // digit-by-digit locally before the parent's `value` reflects the committed change.
  React.useEffect(() => {
    const date = parseDateTime(value);
    if (date) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHours(pad(date.getHours()));
      setMinutes(pad(date.getMinutes()));
      setSeconds(pad(date.getSeconds()));
    }
  }, [value]);

  // An empty time field means "midnight" only once a date is committed alongside
  // it; while typing it just means "not filled in".
  const timePart = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const commit = (date: Date, h: number, m: number, s: number) => {
    const next = new Date(date);
    next.setHours(h, m, s, 0);
    onChange(formatDateTime(next));
  };

  const handleSelectDate = (date: Date | undefined) => {
    if (!date) return;
    commit(date, timePart(hours), timePart(minutes), timePart(seconds));
  };

  const handleTimeChange = (
    part: "hours" | "minutes" | "seconds",
    rawValue: string,
  ) => {
    const max = part === "hours" ? 23 : 59;
    const parsed = Number.parseInt(rawValue, 10);

    // Clearing the field used to run through `Number.parseInt("") || 0` and snap
    // straight back to "00" - so a diver correcting 08:15 to 18:15 could never
    // empty the box to retype it. Unparseable input leaves the field as typed and
    // commits nothing, matching how the dive form's number inputs treat NaN.
    if (Number.isNaN(parsed)) {
      if (part === "hours") setHours("");
      if (part === "minutes") setMinutes("");
      if (part === "seconds") setSeconds("");
      return;
    }

    const numeric = clamp(parsed, 0, max);
    const formatted = pad(numeric);

    if (part === "hours") setHours(formatted);
    if (part === "minutes") setMinutes(formatted);
    if (part === "seconds") setSeconds(formatted);

    // Only ever commit against a date the diver actually picked. This used to fall
    // back to `new Date()`, so typing a time into an empty picker silently stamped
    // *today* onto the value - on a dive being back-filled from a paper logbook,
    // today's date is the one date it certainly isn't. With no date chosen the time
    // is held in local state until `handleSelectDate` commits the pair.
    if (!selectedDate) return;

    commit(
      selectedDate,
      part === "hours" ? numeric : timePart(hours),
      part === "minutes" ? numeric : timePart(minutes),
      part === "seconds" ? numeric : timePart(seconds),
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          {...slotProps}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelectDate}
          captionLayout="dropdown"
          startMonth={new Date(1900, 0)}
          endMonth={new Date(new Date().getFullYear() + 5, 11)}
          classNames={{ caption_label: "hidden" }}
          defaultMonth={selectedDate}
          autoFocus
        />
        <div className="flex items-center justify-center gap-1 border-t p-3">
          <Input
            type="number"
            min={0}
            max={23}
            value={hours}
            onChange={(e) => handleTimeChange("hours", e.target.value)}
            className="w-16 text-center"
            aria-label="Hours"
          />
          <span className="text-muted-foreground">:</span>
          <Input
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => handleTimeChange("minutes", e.target.value)}
            className="w-16 text-center"
            aria-label="Minutes"
          />
          <span className="text-muted-foreground">:</span>
          <Input
            type="number"
            min={0}
            max={59}
            value={seconds}
            onChange={(e) => handleTimeChange("seconds", e.target.value)}
            className="w-16 text-center"
            aria-label="Seconds"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
