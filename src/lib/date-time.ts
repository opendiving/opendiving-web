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
    return `${formatDateOnly(startDate, options)} - ${formatDateOnly(endDate, options)}`;
  }
  return formatDateOnly((startDate ?? endDate) as string, options);
}
