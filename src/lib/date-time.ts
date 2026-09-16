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
// The API's `start_time` is *usually* an offset-aware ISO 8601 string, e.g.
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
//
// "Usually", not "always": a dive imported from a DiveJSON document may have no
// offset at all. The format defines an offset-less local date-time as a third
// state - the wall clock is recorded and the instant is genuinely unknown - so
// that a converter never has to fabricate one or drop the dive. The API sends
// that state through as a naive `start_time` ("2026-04-17T11:49:23") and accepts
// one back on a dive that already has none.
//
// **That state is a `null` offset, and it has to survive every helper here.**
// It is not the same as UTC and must never be shown or saved as one: printing
// "+00:00" beside the clock is a claim about the world that nothing recorded.
// `parseUtcOffsetMinutes()` returns `null` for it, `splitStartTime()` hands
// that `null` on, `combineStartTime()` writes no offset when it gets one back,
// and `formatDiveStartTime()` prints no zone at all. See DECISIONS.md, "An
// unknown UTC offset is a third state, and `new Date()` never sees an
// offset-less string".

// Matches a trailing UTC offset ("Z", "+HH:MM", "+HHMM", or "+HH") on an ISO
// 8601 datetime string.
//
// The offset must follow a time component, and that is not a nicety: without
// it, `-04` matches the *day* of a bare "2021-04-04", which a dive computer is
// entirely capable of exporting. That date would then be treated as
// offset-aware and shifted by four hours - silently moving the dive - and it
// would satisfy `diveCreateSchema`'s "must include a UTC offset" refine on the
// way through. The `\d{2}:\d{2}` lookbehind-by-capture anchors the match to a
// real "HH:MM" (optionally with seconds/fraction) so only a genuine offset
// counts.
const OFFSET_SUFFIX_REGEX =
  /\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:(Z)|([+-])(\d{2}):?(\d{2})?)$/;

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

// A date-time carrying no offset, e.g. "2026-04-17T11:49:23" or
// "2026-04-17T11:49:23.910". A space instead of the "T" is accepted because that
// is the shape `formatDateTimeForForm()` produces.
const NAIVE_DATE_TIME_REGEX =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

// Parses a date-time that carries no UTC offset, pinning it to UTC so that the
// *UTC* getters read its digits back unchanged.
//
// This one line is the whole offset-unknown display fix, and it is a correction
// rather than a feature. `new Date("2026-04-17T11:49:23")` is *specified* to
// parse as the browser's local time, so a dive logged at 11:49 with no recorded
// offset used to be shifted by the viewer's own offset on the way through
// `shiftByEmbeddedOffset` - displaying as 08:49 in UTC+03:00 and as 14:49 in
// UTC-03:00, neither of which anything recorded. Appending "Z" removes the
// browser from the calculation entirely.
//
// A bare "YYYY-MM-DD" is left alone: ECMAScript already parses the date-only
// form as UTC, and "2026-04-17Z" is not a date-time at all. Anything else is
// handed to `Date` unchanged, so an unparseable value still comes back NaN
// exactly as it did before.
function parseAsWallClockUtc(isoString: string): Date {
  return NAIVE_DATE_TIME_REGEX.test(isoString)
    ? new Date(`${isoString.replace(" ", "T")}Z`)
    : new Date(isoString);
}

// Shifts an ISO datetime string's underlying instant by its own embedded UTC
// offset. The result is a `Date` whose *UTC* getters read back the original
// wall-clock time - shared by every function below that needs to read or display
// that wall-clock time without ever converting through the browser's own
// timezone.
//
// `offsetMinutes` is `null` for a string that carries no offset, and callers
// must pass that `null` on rather than collapsing it to zero: the wall clock is
// still exact, and it is only the zone that is unknown.
function shiftByEmbeddedOffset(isoString: string): {
  shifted: Date;
  offsetMinutes: number | null;
} {
  const offsetMinutes = parseUtcOffsetMinutes(isoString);
  if (offsetMinutes === null) {
    return { shifted: parseAsWallClockUtc(isoString), offsetMinutes: null };
  }
  return {
    shifted: new Date(new Date(isoString).getTime() + offsetMinutes * 60_000),
    offsetMinutes,
  };
}

// A dive's `start_time` as a timestamp whose *UTC* getters read back the dive's
// own wall-clock time - the numeric counterpart to `formatDiveDateTime()`, for
// code that has to position or bucket a dive on a timeline rather than print it.
//
// Not the same as `new Date(startTime).getTime()`, and the difference is the
// whole point: a dive at 00:30 on New Year's Day in Thailand (+07:00) is still
// the previous year in UTC, and would land in the wrong year on a chart. Read it
// back with `getUTC*` (or format with `timeZone: "UTC"`), never the local
// getters, exactly as `formatDiveDateTime()` does.
export function diveWallClockTime(startTime: string): number {
  return shiftByEmbeddedOffset(startTime).shifted.getTime();
}

// Splits an ISO 8601 datetime string (e.g. the API's dive `start_time`) into its
// wall-clock component - formatted like `formatDateTimeForForm()` - and its UTC
// offset in minutes, *without* ever converting through the browser's own
// timezone.
//
// `offsetMinutes` is `null` when the string carries no offset. That is the
// dive's unknown-offset state travelling out to `UtcOffsetSelect`'s "Not
// recorded" option, and `combineStartTime()` takes it straight back. It used to
// come back as `0` here, which is how an imported dive's first save wrote both
// the wrong hour and a "+00:00" nobody chose.
export function splitStartTime(isoString: string): {
  localDateTime: string;
  offsetMinutes: number | null;
} {
  const { shifted, offsetMinutes } = shiftByEmbeddedOffset(isoString);
  const localDateTime = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
  return { localDateTime, offsetMinutes };
}

// Inverse of `splitStartTime()`: combines a "YYYY-MM-DD HH:mm:ss" wall-clock
// string (as produced by `DateTimePicker`) and a UTC offset in minutes into the
// single ISO 8601 string the API expects for `start_time`.
//
// A `null` offset writes no offset at all, which is the point: the diver editing
// a dive whose zone was never recorded is saving a wall clock and nothing more.
// Appending "+00:00" instead would be this function inventing a fact, and the
// API would store it - the state is unrecoverable once written.
export function combineStartTime(
  localDateTime: string,
  offsetMinutes: number | null,
): string {
  const wallClock = localDateTime.replace(" ", "T");
  return offsetMinutes === null
    ? wallClock
    : `${wallClock}${formatUtcOffset(offsetMinutes)}`;
}

// A `start_time` that carries only a date, with no time at all, e.g.
// "2021-04-04".
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Normalizes a dive-computer file's raw `start_time` into the single
// offset-aware `start_time` string the form (`DiveStartTimeField`) and the API
// both expect. Dive computers export it in three shapes:
//
// - With an explicit offset, e.g. "2021-04-04T10:04:47.910+02:00" - already the
//   shape we want, so it's used as-is.
// - Date-only, e.g. "2021-04-04" - taken as midnight wall-clock. Checked
//   *before* the naive branch below, because `new Date("2021-04-04")` parses as
//   UTC midnight and reading it back with local getters shows the previous day
//   west of Greenwich (see DECISIONS.md, "Bare `YYYY-MM-DD` dates must not go
//   through `new Date(dateString)`").
// - Naive/local, e.g. "2025-06-03T12:15:33.8" - its literal date/time digits
//   are kept (parsing a naive string with `Date` and reading back local getters
//   is a no-op transformation: there is no timezone to convert from) and
//   combined with the browser's current offset, the best available default.
//   It's on the diver to correct it if their computer's clock was set to a
//   different zone than wherever they are now.
//
// Returns `undefined` for anything `Date` can't parse at all.
export function normalizeParsedStartTime(
  rawStartTime: string,
): string | undefined {
  if (parseUtcOffsetMinutes(rawStartTime) !== null) {
    return rawStartTime;
  }

  if (DATE_ONLY_REGEX.test(rawStartTime)) {
    return combineStartTime(
      `${rawStartTime} 00:00:00`,
      getBrowserUtcOffsetMinutes(),
    );
  }

  const date = new Date(rawStartTime);
  if (Number.isNaN(date.getTime())) return undefined;
  return combineStartTime(
    formatDateTimeForForm(date),
    getBrowserUtcOffsetMinutes(),
  );
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

// A dive's start as one line: the date, the wall-clock time it was entered in,
// and the offset that clock was on - "Sunday, April 4, 2021 at 10:04
// (UTC+02:00)". What the dive detail page's header says under the dive number,
// which is the one place all three belong together.
//
// Composed from the two functions above rather than asking `Intl` for the date
// and the time in one call. en-US does join them with " at ", but which
// separator a locale reaches for is an ICU detail, and the offset has to be
// appended by hand at the end either way - so the whole line is assembled here
// rather than half of it being inherited.
//
// A `start_time` carrying no offset prints the date and the clock and **stops** -
// no "(UTC...)" parenthetical at all. This used to say `+00:00`, on the reasoning
// that the API always sent an offset so the case was degenerate; import made it a
// real state, and a wall clock with no zone beside it is exactly what it means.
// Saying "UTC" would be a claim about where the dive happened, which is the one
// thing nothing here knows.
export function formatDiveStartTime(startTime: string): string {
  const date = formatDiveDateTime(startTime, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const offsetMinutes = parseUtcOffsetMinutes(startTime);
  const zone =
    offsetMinutes === null ? "" : ` (UTC${formatUtcOffset(offsetMinutes)})`;

  return `${date} at ${formatDiveTimeOnly(startTime)}${zone}`;
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

// The greeting for an hour of the viewer's own local day (0-23), e.g. the
// dashboard heading. Takes the hour rather than a `Date` so the boundaries can
// be tested without faking the clock.
//
// Anything before 04:00 falls in with the evening: "Good night" is a farewell
// rather than a greeting, and someone reading a dive log at 03:00 is still
// having their evening.
export function greetingForHour(hour: number): string {
  if (hour >= 4 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

// Formats a duration given in seconds as "MM:SS" (the format used in dive
// forms - see `durationField()` in `lib/validations/dive.ts` for the matching
// input validation).
export function formatDurationForForm(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}:${pad(seconds)}`;
}

// Parses the form representation back into a duration in seconds. Assumes
// `value` already matches `durationField()`'s format, which admits both "MM:SS"
// and a bare "MM" - a colonless entry is whole minutes, so the missing half is
// zero seconds rather than a parse failure. `formatDurationForForm` always
// writes the "MM:SS" half, so a "45" typed once comes back as "45:00" on the
// next read of the dive.
export function parseFormDuration(value: string): number {
  const [minutes, seconds] = value.split(":").map(Number);
  return minutes * 60 + (seconds ?? 0);
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
