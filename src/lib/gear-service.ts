// Service-status derivation for gear.
//
// The API deliberately returns only clock-stable facts about a service schedule -
// `next_due_on`, `next_due_at_dive_count`, `last_service_on` - and never a computed
// status. Status depends on today's date, so a cached response carrying it would be
// wrong the next morning (the single-gear-item cache is an hour long). Deriving it here
// keeps the API cacheable and the badge always correct.
//
// This is a near-line-for-line twin of `service_status` in the API's
// `services/gear_service.py`, which exists for the reminder email - the one consumer
// with no browser. The constants are named identically on both sides so a single
// `grep SERVICE_DUE_SOON` finds the pair; change one and you must change the other.

import type {
  GearServiceScheduleSummary,
  ServiceKind,
} from "@/lib/api/gear-service";

// How far ahead a due date starts reading as "due soon". 30 days is roughly the lead
// time for getting a regulator booked in and back before the next trip.
export const SERVICE_DUE_SOON_DAYS = 30;
// The dive-count equivalent - about one trip's worth of diving.
export const SERVICE_DUE_SOON_DIVES = 10;

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

// How urgent one schedule is, given the item's live dive count.
//
// Both interval arms are evaluated and the more urgent verdict wins - that's what
// implements "annually or every 100 dives, whichever comes first". A paused schedule is
// always `ok`: pausing is how a diver silences a rule they're not currently acting on.
export function serviceStatus(
  schedule: GearServiceScheduleSummary,
  diveCount: number,
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

  return dueSoon ? "due_soon" : "ok";
}

// The most urgent status across all of an item's schedules, for the one badge shown in
// the gear list. `null` when the item has no schedules at all, which the UI renders as
// a muted dash rather than a reassuring "ok" - nothing is being tracked, which isn't
// the same as everything being fine.
export function worstServiceStatus(
  schedules: GearServiceScheduleSummary[],
  diveCount: number,
  today: string = todayIsoDate(),
): ServiceStatus | null {
  const active = schedules.filter((s) => s.is_active !== false);
  if (active.length === 0) return null;

  const statuses = active.map((s) => serviceStatus(s, diveCount, today));
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
// new colours: overdue is the same weight as any other destructive state.
export function serviceStatusBadgeVariant(
  status: ServiceStatus,
): "destructive" | "secondary" | "outline" {
  if (status === "overdue") return "destructive";
  if (status === "due_soon") return "secondary";
  return "outline";
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

// A short human phrase for when a schedule is next due, naming whichever arm is the
// urgent one. A regulator that has run out of dives shouldn't be described by a date
// that's still months away.
export function formatServiceDue(
  schedule: GearServiceScheduleSummary,
  diveCount: number,
  today: string = todayIsoDate(),
): string {
  const days = schedule.next_due_on
    ? daysBetweenIsoDates(today, schedule.next_due_on)
    : null;
  const remaining =
    schedule.next_due_at_dive_count != null
      ? schedule.next_due_at_dive_count - diveCount
      : null;

  const dateOverdue = days != null && days <= 0;
  const divesOverdue = remaining != null && remaining <= 0;

  if (divesOverdue && !dateOverdue) {
    const over = -remaining!;
    return `Overdue by ${over} dive${over === 1 ? "" : "s"}`;
  }
  if (dateOverdue) {
    const over = -days!;
    if (over === 0) return "Due today";
    return `Overdue by ${over} day${over === 1 ? "" : "s"}`;
  }
  if (days != null) {
    return `Due in ${days} day${days === 1 ? "" : "s"}`;
  }
  if (remaining != null) {
    return `Due in ${remaining} dive${remaining === 1 ? "" : "s"}`;
  }
  return "No due date";
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
