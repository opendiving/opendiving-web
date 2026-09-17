"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { parseDateInput, parseDateTimeInput } from "@/lib/date-input";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { IconTooltip } from "@/components/ui/tooltip";
import {
  Popover,
  PopoverAnchor,
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

// The value split into the halves the two native inputs edit. Anything that is
// not a whole date-time - "" included - is no date and no time.
function splitDateTime(value: string): [date: string, time: string] {
  const match = value.match(DATE_TIME_REGEX);
  return match ? [value.slice(0, 10), value.slice(11)] : ["", ""];
}

// "HH:mm" as the OS time wheels hand it back, padded to the "HH:mm:ss" the value
// is written in. A browser that does offer seconds - `step={1}` asks for them -
// keeps the ones it was given.
function withSeconds(time: string): string {
  const match = time.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return "";
  const [, hours, minutes, seconds] = match;
  return `${hours}:${minutes}:${seconds ?? "00"}`;
}

export function DateTimePicker({ placeholder, ...props }: DateTimePickerProps) {
  // A finger gets the OS wheels; a hover-capable pointer keeps the text box and
  // the calendar - including the placeholder, which describes a box that is
  // typed into. See `date-picker.tsx`, which chooses the same way.
  return useCoarsePointer() ? (
    <NativeDateTimePicker {...props} />
  ) : (
    <CalendarDateTimePicker placeholder={placeholder} {...props} />
  );
}

// Two native inputs rather than one `datetime-local`: Android chains two dialogs
// for that type, and iOS drops the seconds from the value whenever only the date
// is changed - which is the one edit an imported dive most often needs.
function NativeDateTimePicker({
  value,
  onChange,
  disabled,
  ...slotProps
}: Omit<DateTimePickerProps, "placeholder">) {
  const [datePart, timePart] = splitDateTime(value ?? "");

  // What the time box shows, which is the committed time until there is nothing
  // to commit against: a time set before any date is held here rather than
  // stamping today onto the value, the same rule `handleTimeChange` keeps on the
  // desktop branch. Re-synced during render rather than from an effect, for the
  // reason `date-picker.tsx` gives.
  const [heldTime, setHeldTime] = React.useState(timePart);
  const [syncedValue, setSyncedValue] = React.useState(value ?? "");
  if (syncedValue !== (value ?? "")) {
    setSyncedValue(value ?? "");
    setHeldTime(timePart);
  }

  const handleDateChange = (next: string) => {
    // The committed time rides through a date change untouched, seconds and all:
    // a dive a computer stamped 10:04:47 and a diver re-dates is being re-dated,
    // not re-timed. A time held without a date is what a first date collects.
    if (!next) {
      onChange("");
      return;
    }
    onChange(`${next} ${timePart || withSeconds(heldTime) || "00:00:00"}`);
  };

  const handleTimeChange = (next: string) => {
    setHeldTime(next);
    // An emptied box means "not filled in", not midnight, so it commits nothing
    // and leaves the value as it stands - as clearing an hour on the desktop
    // branch does.
    const time = withSeconds(next);
    if (!datePart || !time) return;
    onChange(`${datePart} ${time}`);
  };

  return (
    <div className="grid grid-cols-[3fr_2fr] gap-2">
      <Input
        {...slotProps}
        type="date"
        value={datePart}
        onChange={(e) => handleDateChange(e.target.value)}
        disabled={disabled}
      />
      {/* A composite field behind one label, so the secondary control names
          itself - see "`FormControl` only labels what it can reach". `step={1}`
          asks for seconds from the browsers that can show them; the OS wheels
          cannot, and `withSeconds` says what that means for the value. */}
      <Input
        type="time"
        step={1}
        aria-label="Time"
        value={heldTime}
        onChange={(e) => handleTimeChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

function CalendarDateTimePicker({
  value,
  onChange,
  placeholder = "YYYY-MM-DD HH:mm:ss",
  disabled,
  ...slotProps
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const selectedDate = parseDateTime(value);

  // Whether the calendar takes focus when it opens - see `date-picker.tsx`.
  // Opening because the diver focused the field must not, or the first keystroke
  // of a typed date lands on a day cell instead of in the box.
  const [focusCalendar, setFocusCalendar] = React.useState(false);

  // What the box shows while it is being typed in; the value moves only when the
  // diver leaves the field or presses Enter, for the reason `date-picker.tsx`
  // sets out - a half-typed date passes through other real dates on its way. A
  // time is optional here; `handleSettle` says where the missing one comes from.
  const [draft, setDraft] = React.useState(value ?? "");

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

  // The text box tracks the same external changes - the calendar, the time
  // fields beside it, a dive file being imported. Adjusted during render, not
  // from an effect, for the reason `date-picker.tsx` gives: an effect leaves the
  // box showing the pre-reset text for one commit. The dive form is where that
  // shows - it stamps `start_time` a second time when the last dive lands, so
  // the box sat on the earlier stamp. A draft that still *means* the incoming
  // value is left as typed.
  const [syncedValue, setSyncedValue] = React.useState(value ?? "");
  if (syncedValue !== (value ?? "")) {
    setSyncedValue(value ?? "");
    if (parseDateTimeInput(draft) !== (value ?? "")) setDraft(value ?? "");
  }

  // An empty time field means "midnight" only once a date is committed alongside
  // it; while typing it just means "not filled in".
  const timePart = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  // Leaving the field settles it; text that never became a date-time is
  // discarded rather than left on screen contradicting the value behind it.
  //
  // A date typed with no time takes the time the popover is holding, matching
  // what `handleSelectDate` does with one picked from the grid. Those two are
  // the only ways a date arrives, and an hour set before any date exists is held
  // rather than committed (see `handleTimeChange`), so both have to collect it.
  const handleSettle = () => {
    const parsed = parseDateTimeInput(draft);
    if (parsed === null) {
      setDraft(value ?? "");
      return;
    }
    const dateOnly = parseDateInput(draft);
    const settled = dateOnly
      ? `${dateOnly} ${pad(timePart(hours))}:${pad(timePart(minutes))}:${pad(timePart(seconds))}`
      : parsed;
    setDraft(settled);
    if (settled !== (value ?? "")) onChange(settled);
  };

  const openFromField = () => {
    setFocusCalendar(false);
    setOpen(true);
  };

  // The calendar tracks the text as it is typed rather than the committed value,
  // so one left open under a diver typing a date a year away is not sitting on
  // last year's month. Display only - `handleTimeChange` still commits against
  // `selectedDate`, which is safe because reaching the time boxes means clicking
  // out of the text box, and that blur has already settled the draft.
  const shownDate = parseDateTime(parseDateTimeInput(draft) ?? value);
  const shownMonth = shownDate
    ? `${shownDate.getFullYear()}-${pad(shownDate.getMonth() + 1)}`
    : "";

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
      {/* Anchored on the whole field rather than on the icon that opens it, so
          the calendar hangs off the field's left edge - see `date-picker.tsx`. */}
      <PopoverAnchor asChild>
        {/* The calendar button is layered over the input's right edge rather
            than sitting beside it, so the field keeps one box on a form row. */}
        <div ref={anchorRef} className="relative">
          <Input
            {...slotProps}
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={openFromField}
            // Focus alone isn't enough: a `focus` event doesn't fire on an input
            // that already has focus, so Escape would leave the calendar
            // unopenable without clicking away first. `creatable-combobox`
            // carries the same pair for the same reason.
            onClick={openFromField}
            onBlur={handleSettle}
            // Enter submits the surrounding form, and does it without blurring
            // first, so the last thing typed has to be committed here or the
            // form reads the value from before it.
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSettle();
            }}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            className="pr-9"
          />
          <IconTooltip label="Choose date and time">
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setFocusCalendar(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                <CalendarIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </IconTooltip>
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        // All three as in `date-picker.tsx`, for the reasons given there.
        onOpenAutoFocus={(event) => {
          if (!focusCalendar) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (!focusCalendar) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (anchorRef.current?.contains(event.target as Node)) {
            event.preventDefault();
          }
        }}
      >
        <Calendar
          key={shownMonth}
          mode="single"
          selected={shownDate}
          onSelect={handleSelectDate}
          captionLayout="dropdown"
          startMonth={new Date(1900, 0)}
          endMonth={new Date(new Date().getFullYear() + 5, 11)}
          classNames={{ caption_label: "hidden" }}
          defaultMonth={shownDate}
          autoFocus={focusCalendar}
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
