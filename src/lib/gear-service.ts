// Service-status derivation for gear.
//
// The API deliberately returns only clock-stable facts about a service schedule -
// `next_due_on`, `next_due_at_dive_count`, `next_due_at_dive_time`, `last_service_on` -
// and never a computed
// status. Status depends on today's date, so a cached response carrying it would be
// wrong the next morning (the single-gear-item cache is an hour long). Deriving it here
// keeps the API cacheable and the badge always correct.
//
// This is a near-line-for-line twin of `service_status` in the API's
// `services/gear_service.py`, which exists for the reminder email - the one consumer
// with no browser. The constants are named identically on both sides so a single
// `grep SERVICE_DUE_SOON` finds the trio; change one and you must change its twin.

import type {
  GearServiceScheduleSummary,
  ServiceKind,
} from "@/lib/api/gear-service";

// How far ahead a due date starts reading as "due soon". 30 days is roughly the lead
// time for getting a regulator booked in and back before the next trip.
export const SERVICE_DUE_SOON_DAYS = 30;
// The dive-count equivalent - about one trip's worth of diving.
export const SERVICE_DUE_SOON_DIVES = 10;
// The hours-of-diving equivalent, the dive figure's twin. Compared in seconds of
// `dive_time`.
export const SERVICE_DUE_SOON_HOURS = 10;

const SECONDS_PER_HOUR = 3600;

// A remainder of `dive_time` as whole hours, rounded up - forty minutes left reads "1
// hour of diving" rather than "0". The API's `hours_of_diving` rounds the same way, so
// the email and the page never disagree about the figure.
export function hoursOfDiving(seconds: number): number {
  return Math.ceil(seconds / SECONDS_PER_HOUR);
}

export type ServiceStatus = "ok" | "due_soon" | "overdue";

// Today as "YYYY-MM-DD" in the *viewer's* timezone. Built from local getters rather
// than `toISOString()`, which would render UTC and so show tomorrow's (or yesterday's)
// date for anyone far enough east or west.
export function todayIsoDate(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Whole days from `from` to `to`, both bare "YYYY-MM-DD" strings. Negative once `to` is
// in the past.
//
// Both dates are constructed from their split parts, never `new Date(dateString)`: a
// bare date string parses as UTC midnight, which lands on the previous day in every
// negative-UTC-offset timezone and would make a due date read as one day closer than it
// is. Same reasoning as `formatDateOnly()` in `lib/date-time.ts`.
//
// Using local midnight for both ends also makes this immune to DST: the two Dates shift
// by the same offset, and rounding the millisecond difference absorbs the one 23- or
// 25-hour day in between.
export function daysBetweenIsoDates(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const start = new Date(fromYear, fromMonth - 1, fromDay);
  const end = new Date(toYear, toMonth - 1, toDay);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

// How urgent one schedule is, given the item's live dive count and dive time (seconds).
//
// Every interval arm is evaluated and the most urgent verdict wins - that's what
// implements "annually or every 100 dives, whichever comes first". A paused schedule is
// always `ok`: pausing is how a diver silences a rule they're not currently acting on.
export function serviceStatus(
  schedule: GearServiceScheduleSummary,
  diveCount: number,
  diveTime: number,
  today: string = todayIsoDate(),
): ServiceStatus {
  if (schedule.is_active === false) return "ok";

  let dueSoon = false;

  if (schedule.next_due_on) {
    const days = daysBetweenIsoDates(today, schedule.next_due_on);
    if (days <= 0) return "overdue";
    if (days <= SERVICE_DUE_SOON_DAYS) dueSoon = true;
  }

  if (schedule.next_due_at_dive_count != null) {
    const remaining = schedule.next_due_at_dive_count - diveCount;
    if (remaining <= 0) return "overdue";
    if (remaining <= SERVICE_DUE_SOON_DIVES) dueSoon = true;
  }

  if (schedule.next_due_at_dive_time != null) {
    const remaining = schedule.next_due_at_dive_time - diveTime;
    if (remaining <= 0) return "overdue";
    if (remaining <= SERVICE_DUE_SOON_HOURS * SECONDS_PER_HOUR) dueSoon = true;
  }

  return dueSoon ? "due_soon" : "ok";
}

// The most urgent status across all of an item's schedules, for the one badge shown in
// the gear list. `null` when the item has no schedules at all, which the UI renders as
// a muted dash rather than a reassuring "ok" - nothing is being tracked, which isn't
// the same as everything being fine.
export function worstServiceStatus(
  schedules: GearServiceScheduleSummary[],
  diveCount: number,
  diveTime: number,
  today: string = todayIsoDate(),
): ServiceStatus | null {
  const active = schedules.filter((s) => s.is_active !== false);
  if (active.length === 0) return null;

  const statuses = active.map((s) =>
    serviceStatus(s, diveCount, diveTime, today),
  );
  if (statuses.includes("overdue")) return "overdue";
  if (statuses.includes("due_soon")) return "due_soon";
  return "ok";
}

export function serviceStatusLabel(status: ServiceStatus): string {
  if (status === "overdue") return "Overdue";
  if (status === "due_soon") return "Due soon";
  return "In service";
}

// Maps onto the `Badge` variants already in the design system rather than introducing
// new colours. All three are filled, and the scale is read by hue rather than by
// weight: teal for settled, the brand coral for due-soon, --destructive-solid for
// overdue. Not `secondary` for due-soon: it is nearly invisible on a card in dark
// mode and, being the same chip as "Rented", doesn't read as a status at all; nor
// --warning's amber, which reads as a fourth accent beside a palette that has three.
export function serviceStatusBadgeVariant(
  status: ServiceStatus,
): "destructive" | "coral" | "teal" {
  if (status === "overdue") return "destructive";
  if (status === "due_soon") return "coral";
  return "teal";
}

// How many dives an item has done since a baseline snapshot, floored at zero.
//
// The floor matters: `dive_count` is a lifetime counter, so deleting dives drives it
// back down and a raw subtraction can go negative. Mirrors `dives_since` in the API's
// `services/gear_service.py`.
export function divesSince(
  diveCount: number,
  baselineDiveCount: number,
): number {
  return Math.max(0, diveCount - baselineDiveCount);
}

type DueUnit = "day" | "dive" | "hour";

// When a schedule is next due, by whichever arm is the urgent one: a regulator that
// has run out of dives shouldn't be described by a date that's still months away.
// `count` is how far past due, or how far off - hours rounded up (`hoursOfDiving`);
// `null` for a schedule with no arm. The precedence is the digest's `_due_text`: an
// overdue dive or hours arm over a date that is not overdue, the dive arm before the
// hours arm, and otherwise the date, which is the arm divers think in.
function nextServiceDue(
  schedule: GearServiceScheduleSummary,
  diveCount: number,
  diveTime: number,
  today: string,
): { overdue: boolean; count: number; unit: DueUnit } | null {
  const days = schedule.next_due_on
    ? daysBetweenIsoDates(today, schedule.next_due_on)
    : null;
  const remaining =
    schedule.next_due_at_dive_count != null
      ? schedule.next_due_at_dive_count - diveCount
      : null;
  const timeRemaining =
    schedule.next_due_at_dive_time != null
      ? schedule.next_due_at_dive_time - diveTime
      : null;

  const dateOverdue = days != null && days <= 0;
  const divesOverdue = remaining != null && remaining <= 0;
  const timeOverdue = timeRemaining != null && timeRemaining <= 0;

  if (divesOverdue && !dateOverdue) {
    return { overdue: true, count: -remaining!, unit: "dive" };
  }
  if (timeOverdue && !dateOverdue) {
    return {
      overdue: true,
      count: hoursOfDiving(-timeRemaining!),
      unit: "hour",
    };
  }
  if (dateOverdue) return { overdue: true, count: -days!, unit: "day" };
  if (days != null) return { overdue: false, count: days, unit: "day" };
  if (remaining != null) {
    return { overdue: false, count: remaining, unit: "dive" };
  }
  if (timeRemaining != null) {
    return {
      overdue: false,
      count: hoursOfDiving(timeRemaining),
      unit: "hour",
    };
  }
  return null;
}

// "3 dives", "1 day", "12 hours of diving" - an hours figure always says it is
// diving, so it never reads as clock hours.
export function countOf(count: number, unit: DueUnit): string {
  const counted = `${count} ${unit}${count === 1 ? "" : "s"}`;
  return unit === "hour" ? `${counted} of diving` : counted;
}

// When an item's next service falls, read off each active schedule's urgent arm
// as `nextServiceDue` picks it: `overdue` when a dive count or an hours figure has
// run out, since that schedule's date says nothing; else the earliest due date, a
// past one included; else the fewest dives left; else, with only hours to go on,
// the fewest hours. `null` when no active schedule has an arm.
export function nextService(
  schedules: GearServiceScheduleSummary[],
  diveCount: number,
  diveTime: number,
  today: string = todayIsoDate(),
):
  | { kind: "overdue" }
  | { kind: "date"; on: string }
  | { kind: "dives"; remaining: number }
  | { kind: "hours"; remaining: number }
  | null {
  let date: string | null = null;
  let dives: number | null = null;
  let hours: number | null = null;
  for (const schedule of schedules) {
    if (schedule.is_active === false) continue;
    const due = nextServiceDue(schedule, diveCount, diveTime, today);
    if (!due) continue;
    if (due.unit === "day") {
      if (!date || schedule.next_due_on! < date) date = schedule.next_due_on!;
      continue;
    }
    if (due.overdue) return { kind: "overdue" };
    if (due.unit === "dive") dives = Math.min(dives ?? due.count, due.count);
    else hours = Math.min(hours ?? due.count, due.count);
  }
  if (date) return { kind: "date", on: date };
  if (dives != null) return { kind: "dives", remaining: dives };
  if (hours != null) return { kind: "hours", remaining: hours };
  return null;
}

// A short human phrase for when a schedule is next due: "Overdue by 3 dives",
// "Due in 10 days", "Due in 12 hours of diving".
export function formatServiceDue(
  schedule: GearServiceScheduleSummary,
  diveCount: number,
  diveTime: number,
  today: string = todayIsoDate(),
): string {
  const due = nextServiceDue(schedule, diveCount, diveTime, today);
  if (!due) return "No due date";
  if (due.overdue) {
    // Due *today* is already overdue, not "nearly due" - `serviceStatus` above badges
    // it destructive, and the API agrees on both counts: `service_status` uses
    // `today >= next_due_on`, and the reminder digest emails "overdue since 11 Aug
    // 2026" for a schedule due that morning. A bare "Due today" here read as
    // reassurance directly under a red Overdue badge, so it names the state first and
    // keeps the useful "and it's today" as the qualifier.
    if (due.unit === "day" && due.count === 0) return "Overdue (due today)";
    return `Overdue by ${countOf(due.count, due.unit)}`;
  }
  return `Due in ${countOf(due.count, due.unit)}`;
}

// The same phrase less the word the badge above it already says - "by 3 dives",
// "in 10 days", "in 12 hours of diving", "today" - for the notifications bell, which
// stacks the two.
export function formatServiceDueQualifier(
  schedule: GearServiceScheduleSummary,
  diveCount: number,
  diveTime: number,
  today: string = todayIsoDate(),
): string {
  const due = nextServiceDue(schedule, diveCount, diveTime, today);
  if (!due) return "no due date";
  if (due.overdue) {
    if (due.unit === "day" && due.count === 0) return "today";
    return `by ${countOf(due.count, due.unit)}`;
  }
  return `in ${countOf(due.count, due.unit)}`;
}

// A schedule the "add service schedule" dialog can prefill, keyed off the gear type.
export interface ServiceSchedulePreset {
  kind: ServiceKind;
  interval_months?: number;
  interval_dives?: number;
}

// Conservative, common-practice starting points - NOT authoritative safety guidance.
// Manufacturer service intervals differ, and cylinder test periods are set by
// jurisdiction (five years in much of the US and EU, two and a half in some regimes for
// some cylinder types). These exist to save typing; the diver is expected to change
// them to whatever their kit and their local rules actually require, which is why every
// field stays editable and nothing is filled in silently on save.
const SERVICE_PRESETS: Partial<Record<string, ServiceSchedulePreset[]>> = {
  // The one piece of kit commonly specified both ways ("annually or every 100 dives").
  regulator: [{ kind: "service", interval_months: 12, interval_dives: 100 }],
  bcd: [{ kind: "service", interval_months: 12 }],
  wing: [{ kind: "service", interval_months: 12 }],
  vest: [{ kind: "service", interval_months: 12 }],
  // A cylinder needs both, on different clocks - the case a single interval per item
  // could never have expressed.
  cylinder: [
    { kind: "visual_inspection", interval_months: 12 },
    { kind: "hydrostatic_test", interval_months: 60 },
  ],
  computer: [{ kind: "battery", interval_months: 24 }],
  light: [{ kind: "battery", interval_months: 24 }],
  // Valves and the dry zipper, rather than a full strip-down.
  drysuit: [{ kind: "service", interval_months: 24 }],
};

// Suggested schedules for a gear type. Returns `[]` for anything without a convention
// worth suggesting (a mask, a knife) and for gear with no type set at all.
export function defaultSchedulesForGearType(
  type: string | null | undefined,
): ServiceSchedulePreset[] {
  if (!type) return [];
  return SERVICE_PRESETS[type] ?? [];
}
