import { describe, expect, it } from "vitest";
import type { AdminStats, AdminStatsDay } from "@/lib/api/admin";
import {
  accountSeries,
  activitySeries,
  currentMonth,
  dailyActive,
  monthLabel,
  monthRange,
  stepMonth,
} from "./daily-stats";

const day = (
  date: string,
  overrides: Partial<AdminStatsDay> = {},
): AdminStatsDay => ({
  day: date,
  accounts_created: {},
  sign_ins: 0,
  active_accounts: 0,
  ...overrides,
});

const stats = (
  days: AdminStatsDay[],
  channels = [{ slug: "scubaboard", label: "ScubaBoard" }],
): AdminStats => ({
  from: days[0].day,
  to: days[days.length - 1].day,
  channels,
  days,
  totals: { accounts: 10, active_now: 3 },
});

describe("months", () => {
  it("reads the current month in UTC, not in the viewer's zone", () => {
    // 23:30 UTC on the last of August is already September east of Greenwich.
    expect(currentMonth(Date.UTC(2026, 7, 31, 23, 30))).toBe("2026-08");
  });

  it("steps across a year boundary both ways", () => {
    expect(stepMonth("2026-01", -1)).toBe("2025-12");
    expect(stepMonth("2025-12", 1)).toBe("2026-01");
  });

  it("asks for a month from its first day to its last", () => {
    expect(monthRange("2026-09")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(monthRange("2028-02")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("names a month", () => {
    expect(monthLabel("2026-09")).toBe("September 2026");
  });
});

describe("the new-accounts series", () => {
  it("labels channels, retired slugs and the fixed doors", () => {
    const series = accountSeries(
      stats([
        day("2026-09-01", {
          accounts_created: { scubaboard: 3, reddit: 1, bootstrap: 1 },
        }),
        day("2026-09-02", { accounts_created: { waitlist: 2, open: 1 } }),
      ]),
    );

    expect(series.map((one) => [one.key, one.label])).toEqual([
      ["scubaboard", "ScubaBoard"],
      ["reddit", "reddit"],
      ["waitlist", "Waiting list"],
      ["invitation", "Member invitation"],
      ["open", "Open registration"],
      ["bootstrap", "First account"],
    ]);
    expect(series[0].values).toEqual([3, 0]);
    expect(series[2].values).toEqual([0, 2]);
  });

  it("keeps a configured channel and both invitation doors at zero", () => {
    const series = accountSeries(stats([day("2026-09-01")]));

    expect(series.map((one) => one.key)).toEqual([
      "scubaboard",
      "waitlist",
      "invitation",
    ]);
    expect(series.every((one) => one.values[0] === 0)).toBe(true);
  });

  it("gives every series a colour", () => {
    const series = accountSeries(
      stats(
        [day("2026-09-01")],
        Array.from({ length: 8 }, (_, index) => ({
          slug: `c${index}`,
          label: `C${index}`,
        })),
      ),
    );

    series.forEach((one) => expect(one.colour).toMatch(/^text-/));
  });
});

describe("the activity series", () => {
  it("is sign-ins and active accounts, per day", () => {
    const series = activitySeries(
      stats([day("2026-09-01", { sign_ins: 2, active_accounts: 5 })]),
    );

    expect(series.map((one) => [one.label, one.values])).toEqual([
      ["Sign-ins", [2]],
      ["Active accounts", [5]],
    ]);
  });
});

describe("daily active", () => {
  const month = stats([
    day("2026-09-01", { active_accounts: 4 }),
    day("2026-09-02", { active_accounts: 8 }),
    day("2026-09-03", { active_accounts: 3 }),
    day("2026-09-04"),
  ]);

  it("finds the busiest day", () => {
    const { peak, peakDay } = dailyActive(month, Date.UTC(2026, 8, 30));

    expect([peak, peakDay]).toEqual([8, "2026-09-02"]);
  });

  it("averages over the days that have happened, not the zero-filled rest", () => {
    expect(dailyActive(month, Date.UTC(2026, 8, 3, 12)).average).toBe(5);
    expect(dailyActive(month, Date.UTC(2026, 8, 30)).average).toBe(3.75);
  });

  it("has no peak day and an average of zero for a quiet past month", () => {
    const quiet = stats([day("2026-08-01"), day("2026-08-02")]);

    expect(dailyActive(quiet, Date.UTC(2026, 8, 1))).toEqual({
      peak: 0,
      peakDay: null,
      average: 0,
    });
  });

  it("has no average for a month none of whose days has begun", () => {
    expect(dailyActive(month, Date.UTC(2026, 7, 31)).average).toBeNull();
  });
});
