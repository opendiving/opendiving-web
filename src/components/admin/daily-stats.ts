import type { AdminStats } from "@/lib/api/admin";

// Everything the stats page computes from `GET /admin/stats`, kept apart from the
// markup so the arithmetic is assertable.
//
// Days are UTC throughout, as the API writes them: the operator reads one instance
// from one place, and a day boundary that moved with the reader's clock would make
// the same month add up differently on two screens. So a month here is a
// `YYYY-MM` string and never a `Date` read back in local time.

/** A calendar month, written `YYYY-MM`. */
export type StatsMonth = string;

const pad = (value: number) => String(value).padStart(2, "0");

function parts(month: StatsMonth): [number, number] {
  const [year, monthOfYear] = month.split("-").map(Number);
  return [year, monthOfYear];
}

/** The UTC month `now` falls in. */
export function currentMonth(now: number = Date.now()): StatsMonth {
  const date = new Date(now);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** The month `delta` months from `month`, across year boundaries. */
export function stepMonth(month: StatsMonth, delta: number): StatsMonth {
  const [year, monthOfYear] = parts(month);
  return currentMonth(Date.UTC(year, monthOfYear - 1 + delta, 1));
}

/**
 * The `from` and `to` of one request for `month`: its first and last day. Day 0
 * of the next month is the last of this one, so no leap-year table.
 */
export function monthRange(month: StatsMonth): { from: string; to: string } {
  const [year, monthOfYear] = parts(month);
  const last = new Date(Date.UTC(year, monthOfYear, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${pad(last)}` };
}

/** "September 2026". */
export function monthLabel(month: StatsMonth): string {
  const [year, monthOfYear] = parts(month);
  return new Date(Date.UTC(year, monthOfYear - 1, 1)).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
}

/** "September 3", for a `YYYY-MM-DD` day. */
export function dayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// The doors an account can come through that are not a channel, by the name the
// API gives them.
const FIXED_SOURCES: Record<string, string> = {
  waitlist: "Waiting list",
  invitation: "Member invitation",
  open: "Open registration",
  bootstrap: "First account",
};

// Chart accents from `globals.css`, each declared once for both themes and
// clearing 3:1 against either card, as the text colour an SVG mark fills with
// `currentColor`. Written out whole so Tailwind finds them. The fixed doors keep
// one colour each, so "Waiting list" is the same violet every month; channels take
// the rest in turn, and past six of them a colour repeats - the legend names every
// series in words, so colour is never the only thing telling two apart.
const FIXED_COLOURS: Record<string, string> = {
  waitlist: "text-pressure",
  invitation: "text-teal",
  open: "text-tts",
  bootstrap: "text-cns",
};
const CHANNEL_COLOURS = [
  "text-coral",
  "text-ppo2",
  "text-ndl",
  "text-surface-gradient-factor",
  "text-gradient-factor",
  "text-ceiling",
];

export interface Series {
  key: string;
  label: string;
  // A `text-*` class; the marks fill with `currentColor`.
  colour: string;
  // One value per day of the response, in its order.
  values: number[];
}

/**
 * One series per door for the new-accounts chart, in the legend's order: every
 * configured channel, then any other slug that created an account this month (a
 * channel since retired, labelled by its slug), then the waiting list and member
 * invitations, then open registration and the first account when this month has
 * any.
 *
 * The configured channels and the two invitation doors are there even at zero -
 * "nothing came through ScubaBoard this month" is the answer the chart is asked
 * for - while open registration and the first account only mean something on the
 * instances and in the month where they happened.
 */
export function accountSeries(stats: AdminStats): Series[] {
  const channels = new Map(
    stats.channels.map((channel) => [channel.slug, channel.label]),
  );
  const seen = new Set(
    stats.days.flatMap((day) => Object.keys(day.accounts_created)),
  );

  const retired = [...seen]
    .filter((key) => !channels.has(key) && !(key in FIXED_SOURCES))
    .sort();
  const fixed = Object.keys(FIXED_SOURCES).filter(
    (key) => key === "waitlist" || key === "invitation" || seen.has(key),
  );

  const values = (key: string) =>
    stats.days.map((day) => day.accounts_created[key] ?? 0);

  return [
    ...[...channels.keys(), ...retired].map((key, index) => ({
      key,
      label: channels.get(key) ?? key,
      colour: CHANNEL_COLOURS[index % CHANNEL_COLOURS.length],
      values: values(key),
    })),
    ...fixed.map((key) => ({
      key,
      label: FIXED_SOURCES[key],
      colour: FIXED_COLOURS[key],
      values: values(key),
    })),
  ];
}

/** The activity chart's two series: sign-ins, and accounts with a session used. */
export function activitySeries(stats: AdminStats): Series[] {
  return [
    {
      key: "sign_ins",
      label: "Sign-ins",
      colour: "text-coral",
      values: stats.days.map((day) => day.sign_ins),
    },
    {
      key: "active_accounts",
      label: "Active accounts",
      colour: "text-teal",
      values: stats.days.map((day) => day.active_accounts),
    },
  ];
}

export interface DailyActive {
  // The busiest day's count, and the day - null when no day had anyone.
  peak: number;
  peakDay: string | null;
  // Mean over the days that have happened, or null when none has.
  average: number | null;
}

/**
 * The month's peak and average daily active, from `days` alone: no count of
 * distinct accounts over a window exists to ask for, because nothing records who
 * was active on which day beyond the day's total.
 *
 * The average runs over the days up to and including today, since the API
 * zero-fills the rest of the month and counting those would halve a current
 * month's average on the 15th.
 */
export function dailyActive(
  stats: AdminStats,
  now: number = Date.now(),
): DailyActive {
  const today = new Date(now).toISOString().slice(0, 10);
  const elapsed = stats.days.filter((day) => day.day <= today);

  const busiest = stats.days.reduce<AdminStats["days"][number] | null>(
    (best, day) =>
      day.active_accounts > (best?.active_accounts ?? 0) ? day : best,
    null,
  );

  return {
    peak: busiest?.active_accounts ?? 0,
    peakDay: busiest?.day ?? null,
    average:
      elapsed.length === 0
        ? null
        : elapsed.reduce((sum, day) => sum + day.active_accounts, 0) /
          elapsed.length,
  };
}
