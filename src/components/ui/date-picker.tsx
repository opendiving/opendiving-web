"use client";

import * as React from "react";
import { CalendarIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { parseDateInput } from "@/lib/date-input";
import { Input } from "@/components/ui/input";
import { IconTooltip } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FormControlSlotProps } from "@/components/ui/form";

const DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const match = value.match(DATE_REGEX);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export interface DatePickerProps extends FormControlSlotProps {
  /** Value formatted as "YYYY-MM-DD", or "" for no selection. */
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "YYYY-MM-DD",
  disabled,
  ...slotProps
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const anchorRef = React.useRef<HTMLDivElement>(null);

  // Whether the calendar takes focus when it opens. Opening from the icon button
  // should put focus in the grid so the arrow keys drive it; opening because the
  // diver focused the field must not, or the first keystroke of a typed date
  // lands on a day cell instead of in the box.
  const [focusCalendar, setFocusCalendar] = React.useState(false);

  // What the box shows while it is being typed in, which is not the value: the
  // value only moves when the diver leaves the field or presses Enter.
  //
  // **Committing every keystroke that happens to parse is the tempting version
  // and it is wrong.** Typing "2024-06-31" passes through "2024-06-3", so a date
  // that does not exist would leave the field holding the 3rd of June - a real
  // date, a plausible one, and not the one anybody typed. Settling once, on the
  // way out, has nothing to fall back to but the value that was already there.
  const [draft, setDraft] = React.useState(value ?? "");

  // Re-sync when the value changes from outside - the calendar, a form reset, a
  // dive file being imported. A draft that still *means* the incoming value is
  // left alone, so the normalization `handleSettle` just committed does not
  // arrive twice.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft((current) =>
      parseDateInput(current) === (value ?? "") ? current : (value ?? ""),
    );
  }, [value]);

  // Leaving the field settles it. Text that never became a date is discarded
  // rather than left on screen contradicting the value behind it - there is no
  // half-entered state for a date to be saved in, and every caller of this
  // component treats what it gets as a real one.
  const handleSettle = () => {
    const parsed = parseDateInput(draft);
    setDraft(parsed ?? value ?? "");
    if (parsed !== null && parsed !== (value ?? "")) onChange(parsed);
  };

  const handleSelectDate = (date: Date | undefined) => {
    if (!date) return;
    const next = formatDate(date);
    setDraft(next);
    onChange(next);
    // Focus lands in the box rather than on the icon Radix would return it to:
    // this is a field a diver types in. Closing *after* that focus is the whole
    // trick - focusing the box runs the handler that opens the calendar, so a
    // close written first would be undone by it and a pick would never shut the
    // calendar. Both updates land in one batch and the last one wins.
    inputRef.current?.focus();
    setOpen(false);
  };

  const openFromField = () => {
    setFocusCalendar(false);
    setOpen(true);
  };

  // The calendar tracks the text as it is typed, so one left open under a diver
  // typing a date a year away is not sitting on last year's month. Display only:
  // nothing is committed until `handleSettle` runs, and a draft that reads as no
  // date at all falls back to what the field actually holds.
  const shownDate = parseDate(parseDateInput(draft) ?? value);

  // Remounting the calendar is what re-reads `defaultMonth`, and keying on the
  // month means that happens only when the typed month actually moves - so the
  // diver's own paging with the arrows survives, and a remount can never land
  // mid-keystroke in the grid, which is a place the typed month cannot change
  // from. The controlled `month` prop would need state and an effect to say the
  // same thing.
  const shownMonth = shownDate
    ? `${shownDate.getFullYear()}-${pad(shownDate.getMonth() + 1)}`
    : "";

  const showClear = Boolean(draft) && !disabled;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Anchored on the whole field rather than on the icon that opens it, so
          the calendar still hangs off the field's left edge instead of off a
          16px button near the right one - a dialog is not wide enough for the
          difference to be cosmetic. */}
      <PopoverAnchor asChild>
        {/* The calendar and clear buttons are layered over the input's right
            edge - the same treatment `creatable-combobox` gives its own clear
            control - with the padding kept clear of whichever is showing. */}
        <div ref={anchorRef} className="relative">
          <Input
            {...slotProps}
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={openFromField}
            // Focus alone isn't enough: a `focus` event doesn't fire on an input
            // that already has focus, so Escape - or picking a date, which
            // returns focus here - would leave the calendar unopenable without
            // clicking away first. `creatable-combobox` carries the same pair
            // for the same reason.
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
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            className={cn(showClear ? "pr-16" : "pr-9")}
          />
          <IconTooltip label="Choose date">
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
          {showClear && (
            <IconTooltip label="Clear">
              <button
                type="button"
                className="absolute right-9 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setDraft("");
                  onChange("");
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </IconTooltip>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        // Focus stays in the box unless the icon button asked for the grid, so
        // a calendar that opened because the diver tabbed into the field does
        // not swallow what they type next.
        onOpenAutoFocus={(event) => {
          if (!focusCalendar) event.preventDefault();
        }}
        // Radix would send focus back to the trigger; `handleSelectDate` puts it
        // in the box instead, and on Escape it has never left.
        onCloseAutoFocus={(event) => event.preventDefault()}
        // Clicking the box or its own buttons is not "outside" - without this,
        // Radix closes the calendar on the pointer-down and the field's own
        // handler reopens it on the click, which reads as a flicker.
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
      </PopoverContent>
    </Popover>
  );
}
