function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// Formats a Date as "YYYY-MM-DD HH:mm:ss", the format used throughout the dive forms.
export function formatDateTimeForForm(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Parses the "YYYY-MM-DD HH:mm:ss" form representation back into a native Date.
export function parseFormDateTime(value: string): Date {
  return new Date(value.replace(" ", "T"));
}

// --- UTC-offset-aware dive `start_time` helpers ---
//
// The API's `start_time` is always an offset-aware ISO 8601 string, e.g.
// "2021-04-04T10:04:47.910+02:00" - the offset is the dive's *own* original
// timezone (wherever/whatever logged it), not the viewer's. The dive form
// splits that single string into a "YYYY-MM-DD HH:mm:ss" wall-clock string
// (fed to `DateTimePicker`, same format `formatDateTimeForForm()` produces)
// plus a UTC offset in minutes (fed to `UtcOffsetSelect`), and combines them
// back before submitting - all without ever converting through the
// *browser's* timezone, so a dive always displays in the timezone it was
// actually logged in. See `dive-file-import.tsx` for how a dive-computer
// file's `start_time` (which may or may not carry its own explicit offset)
// feeds into this.

// Matches a trailing UTC offset ("Z", "+HH:MM", "+HHMM", or "+HH") on an ISO
// 8601 datetime string.
const OFFSET_SUFFIX_REGEX = /(Z)$|([+-])(\d{2}):?(\d{2})?$/;

// Returns the UTC offset (in minutes) embedded in an ISO 8601 datetime
// string, e.g. 120 for "...+02:00", or `null` if it has none (a "naive"
// datetime with no offset at all, e.g. how some dive computers export
// `start_time`).
export function parseUtcOffsetMinutes(isoString: string): number | null {
  const match = isoString.match(OFFSET_SUFFIX_REGEX);
  if (!match) return null;
  if (match[1] === "Z") return 0;
  const sign = match[2] === "-" ? -1 : 1;
  const hours = Number(match[3]);
  const minutes = Number(match[4] ?? 0);
  return sign * (hours * 60 + minutes);
}

// Formats a UTC offset in minutes as "+02:00" / "-05:30" / "+00:00".
export function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// The browser's current UTC offset in minutes (e.g. 120 for UTC+02:00) - the
// default offset for a new dive, and the fallback when importing a
// dive-computer file whose `start_time` has no explicit offset of its own.
// `Date.prototype.getTimezoneOffset()` returns the *negated* value (minutes
// to ADD to local time to reach UTC), so its sign is flipped here.
export function getBrowserUtcOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

// Shifts an offset-aware ISO datetime string's underlying instant by its own
// embedded UTC offset (defaulting to UTC if it has none). The result is a
// `Date` whose *UTC* getters read back the original wall-clock time - shared
// by every function below that needs to read or display that wall-clock
// time without ever converting through the browser's own timezone.
function shiftByEmbeddedOffset(isoString: string): {
  shifted: Date;
  offsetMinutes: number;
} {
  const offsetMinutes = parseUtcOffsetMinutes(isoString) ?? 0;
  const shifted = new Date(
    new Date(isoString).getTime() + offsetMinutes * 60_000,
  );
  return { shifted, offsetMinutes };
}

// Splits an offset-aware ISO 8601 datetime string (e.g. the API's dive
// `start_time`) into its wall-clock component - formatted like
// `formatDateTimeForForm()` - and its UTC offset in minutes, *without* ever
// converting through the browser's own timezone. Falls back to a UTC
// ("+00:00") offset if the string has none.
export function splitStartTime(isoString: string): {
  localDateTime: string;
  offsetMinutes: number;
} {
  const { shifted, offsetMinutes } = shiftByEmbeddedOffset(isoString);
  const localDateTime = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
  return { localDateTime, offsetMinutes };
}

// Inverse of `splitStartTime()`: combines a "YYYY-MM-DD HH:mm:ss" wall-clock
// string (as produced by `DateTimePicker`) and a UTC offset in minutes into
// the offset-aware ISO 8601 string the API expects for `start_time`.
export function combineStartTime(
  localDateTime: string,
  offsetMinutes: number,
): string {
  return `${localDateTime.replace(" ", "T")}${formatUtcOffset(offsetMinutes)}`;
}

// The default `start_time` for a brand-new dive: right now, in the browser's
// own current UTC offset (the best available guess for someone logging a
// dive shortly after diving it).
export function nowStartTime(): string {
  return combineStartTime(
    formatDateTimeForForm(new Date()),
    getBrowserUtcOffsetMinutes(),
  );
}

// Formats a dive's `start_time` for display *in the dive's own original
// timezone*, not the viewer's browser timezone - e.g. a dive logged at 09:00
// in Thailand (+07:00) always shows as 09:00, no matter where it's viewed
// from. Only use this for a dive's `start_time`; other timestamps (e.g.
// `created_at`) should keep using `formatDateTime()` below, which
// intentionally shows the viewer's own local time.
export function formatDiveDateTime(
  startTime: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return shiftByEmbeddedOffset(startTime).shifted.toLocaleDateString("en-US", {
    hour12: false,
    ...(options ?? {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    timeZone: "UTC",
  });
}

// Time-of-day counterpart to `formatDiveDateTime()` - see its docs above.
export function formatDiveTimeOnly(
  startTime: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return shiftByEmbeddedOffset(startTime).shifted.toLocaleTimeString("en-US", {
    hour12: false,
    ...(options ?? { hour: "2-digit", minute: "2-digit" }),
    timeZone: "UTC",
  });
}

// Formats a plain "YYYY-MM-DD" date (no time component, e.g. a trip's start
// or end date) without going through timezone-sensitive UTC parsing - using
// `new Date(dateString)` directly can shift the displayed day by one in
// negative-UTC-offset timezones since bare date strings parse as UTC midnight.
export function formatDateOnly(
  dateString: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(
    "en-US",
    options ?? { year: "numeric", month: "short", day: "numeric" },
  );
}

// Formats a full ISO datetime string (e.g. any record's `created_at`) for
// display *in the viewer's own browser timezone*. Unlike `formatDateOnly()`,
// this goes through `new Date(dateString)` directly since the input already
// carries a time component (and, typically, a timezone offset) - only bare
// `YYYY-MM-DD` dates need the manual local-construction workaround.
//
// Do NOT use this for a dive's `start_time` - use `formatDiveDateTime()`
// above instead, which displays in the dive's own original timezone rather
// than the viewer's.
export function formatDateTime(
  dateString: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    hour12: false,
    ...(options ?? {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  });
}

// Time-of-day counterpart to `formatDateTime()` above - same caveat applies:
// this shows the viewer's own local time, so don't use it for a dive's
// `start_time` (use `formatDiveTimeOnly()` instead).
export function formatTimeOnly(
  dateString: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(dateString).toLocaleTimeString("en-US", {
    hour12: false,
    ...(options ?? { hour: "2-digit", minute: "2-digit" }),
  });
}

// Formats a duration given in seconds as "MM:SS" (the format used in dive
// forms - see `durationField()` in `lib/validations/dive.ts` for the matching
// input validation).
export function formatDurationForForm(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}:${pad(seconds)}`;
}

// Parses the "MM:SS" form representation back into a duration in seconds.
// Assumes `value` already matches `durationField()`'s format.
export function parseFormDuration(value: string): number {
  const [minutes, seconds] = value.split(":").map(Number);
  return minutes * 60 + seconds;
}

// Formats a duration given in seconds as "Xh Ym" (or just "Ymin" under an hour).
export function formatDurationHoursMinutes(durationSeconds: number): string {
  const totalMinutes = Math.round(durationSeconds / 60);

  if (totalMinutes < 60) {
    return `${totalMinutes}min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
}

// Formats a trip's start/end date range for display, e.g. "Jun 1 - Jun 8, 2024".
// Returns `undefined` if neither date is set.
export function formatTripDateRange(
  startDate?: string,
  endDate?: string,
  options?: Intl.DateTimeFormatOptions,
): string | undefined {
  if (!startDate && !endDate) return undefined;
  if (startDate && endDate) {
    const resolvedOptions = options ?? {
      year: "numeric",
      month: "short",
      day: "numeric",
    };
    const sameYear = startDate.split("-")[0] === endDate.split("-")[0];
    // Drop the year from the start date when both dates fall in the same
    // year, e.g. "Jun 1 - Jun 8, 2024" instead of "Jun 1, 2024 - Jun 8, 2024".
    const startOptions = sameYear
      ? { ...resolvedOptions, year: undefined }
      : resolvedOptions;
    return `${formatDateOnly(startDate, startOptions)} - ${formatDateOnly(endDate, resolvedOptions)}`;
  }
  return formatDateOnly((startDate ?? endDate) as string, options);
}
