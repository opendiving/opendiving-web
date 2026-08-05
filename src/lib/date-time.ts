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

// Formats a full ISO datetime string (e.g. a dive's `start_time` or any
// record's `created_at`) for display. Unlike `formatDateOnly()`, this goes
// through `new Date(dateString)` directly since the input already carries a
// time component (and, typically, a timezone offset) - only bare
// `YYYY-MM-DD` dates need the manual local-construction workaround.
export function formatDateTime(
  dateString: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(dateString).toLocaleDateString(
    "en-US",
    options ?? {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

// Formats a full ISO datetime string's time-of-day component, e.g. a dive's
// `start_time`, for display on its own (see `formatDateTime()` above for the
// combined date+time case).
export function formatTimeOnly(
  dateString: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(dateString).toLocaleTimeString(
    "en-US",
    options ?? { hour: "2-digit", minute: "2-digit" },
  );
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
    const resolvedOptions =
      options ?? { year: "numeric", month: "short", day: "numeric" };
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
