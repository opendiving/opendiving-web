// Reading a date a diver typed or pasted, as opposed to one the calendar
// produced. `lib/date-time.ts` formats and shifts dates that are already known
// to be well-formed; everything here is about text that may be nothing of the
// sort.
//
// **Year first, always.** The separators are loose because they cost nothing -
// "2024/06/01", "2024.06.01" and "20240601" are all one date and only one date.
// Day-first and month-first orders are not accepted at any price: "01/06/2024"
// is the 1st of June to most of the world and the 6th of January to the rest,
// and a picker that guesses stores a dive on the wrong day without ever saying
// so. The placeholder on every field says which order to type.

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function padYear(value: number): string {
  return String(value).padStart(4, "0");
}

// A date part with loose separators, e.g. "2024-6-1", "2024/06/01", "2024.6.01".
const DATE_PART = "(\\d{4})[-/. ](\\d{1,2})[-/. ](\\d{1,2})";

// The separatorless form a spreadsheet or a dive-computer export writes.
const COMPACT_DATE_PART = "(\\d{4})(\\d{2})(\\d{2})";

const DATE_REGEX = new RegExp(`^(?:${DATE_PART}|${COMPACT_DATE_PART})$`);

// The same date, optionally followed by a wall-clock time: "T" or a space, then
// "HH:mm" with optional seconds and an optional fraction that this field has no
// room for and drops.
//
// Anchored at both ends, which is what refuses a trailing "Z" or "+02:00". That
// refusal is the point rather than a limitation: the value this produces is a
// wall clock with no zone attached, and the zone of a pasted ISO string would
// have to be either honoured - which this function cannot do, it returns a
// string with nowhere to put one - or dropped, which moves the dive by the
// offset and says nothing. `DiveStartTimeField` keeps the offset in a control of
// its own for exactly that reason.
const DATE_TIME_REGEX = new RegExp(
  `^(?:${DATE_PART}|${COMPACT_DATE_PART})(?:[T ](\\d{1,2}):(\\d{1,2})(?::(\\d{1,2})(?:\\.\\d+)?)?)?$`,
);

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

// Rejects the 31st of a 30-day month and the 29th of a common February, rather
// than letting `new Date(2025, 1, 29)` roll it into March and store a day the
// diver never typed. Done in arithmetic because `new Date(year, ...)` remaps a
// two-digit year to the 1900s, and a four-digit "0024" is text this has to read.
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const last = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return day <= last;
}

// The three date capture groups of either alternative above - only one of the
// two ever matches, so the first defined triple wins.
function datePartsOf(match: RegExpMatchArray): [number, number, number] {
  const [year, month, day] = match[1] ? match.slice(1, 4) : match.slice(4, 7);
  return [Number(year), Number(month), Number(day)];
}

/**
 * Reads typed or pasted text as a "YYYY-MM-DD" date.
 *
 * Returns `""` for blank text - the value every date field in this app holds
 * when it has no date - and `null` for text that is not a date at all, which is
 * a distinction the caller has to keep: `""` is a diver clearing the field and
 * `null` is one mid-keystroke.
 */
export function parseDateInput(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "";

  const match = text.match(DATE_REGEX);
  if (!match) return null;

  const [year, month, day] = datePartsOf(match);
  if (!isRealDate(year, month, day)) return null;
  return `${padYear(year)}-${pad(month)}-${pad(day)}`;
}

/**
 * Reads typed or pasted text as a "YYYY-MM-DD HH:mm:ss" wall-clock date-time.
 *
 * A time is optional and a bare date means midnight, matching what picking a
 * date in the calendar with the time fields untouched already does. Returns
 * `""` for blank text and `null` for anything unreadable, as `parseDateInput`
 * does.
 */
export function parseDateTimeInput(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "";

  const match = text.match(DATE_TIME_REGEX);
  if (!match) return null;

  const [year, month, day] = datePartsOf(match);
  if (!isRealDate(year, month, day)) return null;

  const hours = Number(match[7] ?? 0);
  const minutes = Number(match[8] ?? 0);
  const seconds = Number(match[9] ?? 0);
  // Out of range is a typo, not something to clamp: "25:00" silently becoming
  // 23:00 is a dive an hour earlier than the one being logged.
  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  return `${padYear(year)}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
