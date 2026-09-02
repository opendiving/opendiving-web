import { describe, expect, it } from "vitest";
import type { GearServiceScheduleSummary } from "@/lib/api/gear-service";
import {
  SERVICE_DUE_SOON_DAYS,
  SERVICE_DUE_SOON_DIVES,
  daysBetweenIsoDates,
  defaultSchedulesForGearType,
  divesSince,
  formatServiceDue,
  serviceStatus,
  serviceStatusBadgeVariant,
  serviceStatusLabel,
  todayIsoDate,
  worstServiceStatus,
} from "@/lib/gear-service";

const TODAY = "2026-08-10";

function schedule(
  overrides: Partial<GearServiceScheduleSummary> = {},
): GearServiceScheduleSummary {
  return {
    uuid: "s1",
    kind: "service",
    is_active: true,
    ...overrides,
  };
}

describe("todayIsoDate", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(todayIsoDate(new Date(2026, 7, 9, 23, 30))).toBe("2026-08-09");
  });

  it("uses local date parts, not UTC", () => {
    // 23:30 local on the 9th is already the 10th in UTC for any positive offset, so a
    // `toISOString()`-based implementation would report tomorrow for half the world.
    const late = new Date(2026, 7, 9, 23, 30);
    expect(todayIsoDate(late)).toBe(
      `${late.getFullYear()}-08-0${late.getDate()}`,
    );
  });
});

describe("daysBetweenIsoDates", () => {
  it("counts forward and backward", () => {
    expect(daysBetweenIsoDates("2026-08-10", "2026-08-20")).toBe(10);
    expect(daysBetweenIsoDates("2026-08-10", "2026-08-01")).toBe(-9);
    expect(daysBetweenIsoDates("2026-08-10", "2026-08-10")).toBe(0);
  });

  it("crosses month and year boundaries", () => {
    expect(daysBetweenIsoDates("2026-12-25", "2027-01-01")).toBe(7);
    expect(daysBetweenIsoDates("2028-02-28", "2028-03-01")).toBe(2); // leap year
  });

  it("is exact across a DST transition", () => {
    // Most of Europe springs forward on 29 March 2026 and falls back on 25 October.
    // A naive millisecond division would return 6.958… or 7.041… days here; rounding
    // local-midnight Dates absorbs the 23- and 25-hour day.
    expect(daysBetweenIsoDates("2026-03-26", "2026-04-02")).toBe(7);
    expect(daysBetweenIsoDates("2026-10-22", "2026-10-29")).toBe(7);
  });

  it("never shifts a bare date by a day", () => {
    // The `new Date("2026-08-20")` trap: that parses as UTC midnight, which is the
    // 19th anywhere west of Greenwich. Building from split parts avoids it, so this
    // holds regardless of the machine's timezone.
    expect(daysBetweenIsoDates(TODAY, "2026-08-20")).toBe(10);
    expect(daysBetweenIsoDates("2026-01-01", "2026-01-02")).toBe(1);
  });
});

describe("serviceStatus", () => {
  it("is ok when nothing is tracked", () => {
    expect(serviceStatus(schedule(), 0, TODAY)).toBe("ok");
  });

  it("is ok when the due date is far away", () => {
    expect(
      serviceStatus(schedule({ next_due_on: "2027-08-10" }), 0, TODAY),
    ).toBe("ok");
  });

  it("is due_soon inside the window", () => {
    expect(
      serviceStatus(schedule({ next_due_on: "2026-08-20" }), 0, TODAY),
    ).toBe("due_soon");
  });

  it("is overdue on and after the due date", () => {
    expect(
      serviceStatus(schedule({ next_due_on: "2026-08-10" }), 0, TODAY),
    ).toBe("overdue");
    expect(
      serviceStatus(schedule({ next_due_on: "2026-08-09" }), 0, TODAY),
    ).toBe("overdue");
  });

  it("has an exact date boundary", () => {
    // 30 days out is due soon; 31 is not.
    expect(
      serviceStatus(schedule({ next_due_on: "2026-09-09" }), 0, TODAY),
    ).toBe("due_soon");
    expect(daysBetweenIsoDates(TODAY, "2026-09-09")).toBe(
      SERVICE_DUE_SOON_DAYS,
    );
    expect(
      serviceStatus(schedule({ next_due_on: "2026-09-10" }), 0, TODAY),
    ).toBe("ok");
  });

  it("tracks the dive arm on its own", () => {
    const s = schedule({ next_due_at_dive_count: 140 });
    expect(serviceStatus(s, 40, TODAY)).toBe("ok");
    expect(serviceStatus(s, 140 - SERVICE_DUE_SOON_DIVES, TODAY)).toBe(
      "due_soon",
    );
    expect(serviceStatus(s, 140 - SERVICE_DUE_SOON_DIVES - 1, TODAY)).toBe(
      "ok",
    );
    expect(serviceStatus(s, 140, TODAY)).toBe("overdue");
    expect(serviceStatus(s, 207, TODAY)).toBe("overdue");
  });

  it("lets the more urgent arm win", () => {
    // "annually or every 100 dives, whichever comes first"
    const both = schedule({
      next_due_on: "2027-08-10",
      next_due_at_dive_count: 140,
    });
    expect(serviceStatus(both, 150, TODAY)).toBe("overdue");
    expect(serviceStatus(both, 135, TODAY)).toBe("due_soon");
    expect(serviceStatus(both, 40, TODAY)).toBe("ok");
  });

  it("treats a paused schedule as ok", () => {
    expect(
      serviceStatus(
        schedule({ next_due_on: "2020-01-01", is_active: false }),
        0,
        TODAY,
      ),
    ).toBe("ok");
  });
});

describe("worstServiceStatus", () => {
  it("is null when nothing is tracked", () => {
    // Distinct from "ok" on purpose: no schedules means nothing is being watched,
    // which is not the same as everything being fine.
    expect(worstServiceStatus([], 0, TODAY)).toBeNull();
  });

  it("is null when every schedule is paused", () => {
    expect(
      worstServiceStatus(
        [schedule({ next_due_on: "2020-01-01", is_active: false })],
        0,
        TODAY,
      ),
    ).toBeNull();
  });

  it("picks overdue over due_soon over ok", () => {
    const ok = schedule({ uuid: "a", next_due_on: "2028-01-01" });
    const soon = schedule({ uuid: "b", next_due_on: "2026-08-20" });
    const late = schedule({ uuid: "c", next_due_on: "2020-01-01" });

    expect(worstServiceStatus([ok], 0, TODAY)).toBe("ok");
    expect(worstServiceStatus([ok, soon], 0, TODAY)).toBe("due_soon");
    expect(worstServiceStatus([ok, soon, late], 0, TODAY)).toBe("overdue");
    // Order must not matter.
    expect(worstServiceStatus([late, soon, ok], 0, TODAY)).toBe("overdue");
  });
});

describe("serviceStatusLabel / serviceStatusBadgeVariant", () => {
  it("labels every status", () => {
    expect(serviceStatusLabel("ok")).toBe("In service");
    expect(serviceStatusLabel("due_soon")).toBe("Due soon");
    expect(serviceStatusLabel("overdue")).toBe("Overdue");
  });

  it("maps onto existing badge variants", () => {
    expect(serviceStatusBadgeVariant("overdue")).toBe("destructive");
    expect(serviceStatusBadgeVariant("due_soon")).toBe("coral");
    expect(serviceStatusBadgeVariant("ok")).toBe("outline");
  });
});

describe("divesSince", () => {
  it("counts dives past the baseline", () => {
    expect(divesSince(150, 40)).toBe(110);
    expect(divesSince(40, 40)).toBe(0);
  });

  it("clamps at zero when dives have been deleted", () => {
    // `dive_count` is a lifetime counter and can move backwards.
    expect(divesSince(35, 40)).toBe(0);
  });
});

describe("formatServiceDue", () => {
  it("counts down to a due date", () => {
    expect(
      formatServiceDue(schedule({ next_due_on: "2026-08-20" }), 0, TODAY),
    ).toBe("Due in 10 days");
    expect(
      formatServiceDue(schedule({ next_due_on: "2026-08-11" }), 0, TODAY),
    ).toBe("Due in 1 day");
  });

  it("calls a schedule due today overdue, not merely due", () => {
    expect(formatServiceDue(schedule({ next_due_on: TODAY }), 0, TODAY)).toBe(
      "Overdue (due today)",
    );
  });

  it("counts up once a due date has passed", () => {
    expect(
      formatServiceDue(schedule({ next_due_on: "2026-08-09" }), 0, TODAY),
    ).toBe("Overdue by 1 day");
    expect(
      formatServiceDue(schedule({ next_due_on: "2026-07-11" }), 0, TODAY),
    ).toBe("Overdue by 30 days");
  });

  it("describes a dive-only schedule in dives", () => {
    const s = schedule({ next_due_at_dive_count: 140 });
    expect(formatServiceDue(s, 135, TODAY)).toBe("Due in 5 dives");
    expect(formatServiceDue(s, 139, TODAY)).toBe("Due in 1 dive");
    expect(formatServiceDue(s, 143, TODAY)).toBe("Overdue by 3 dives");
  });

  it("names the dive arm when that is the one that ran out", () => {
    // Telling a diver their regulator is "due in 203 days" when it has actually blown
    // past its dive threshold would be worse than saying nothing.
    const s = schedule({
      next_due_on: "2027-03-01",
      next_due_at_dive_count: 140,
    });
    expect(formatServiceDue(s, 143, TODAY)).toBe("Overdue by 3 dives");
  });

  it("prefers the date arm when both are still in the future", () => {
    const s = schedule({
      next_due_on: "2026-08-20",
      next_due_at_dive_count: 140,
    });
    expect(formatServiceDue(s, 40, TODAY)).toBe("Due in 10 days");
  });

  it("handles a schedule with no thresholds at all", () => {
    expect(formatServiceDue(schedule(), 0, TODAY)).toBe("No due date");
  });
});

// `serviceStatus` drives the badge and `formatServiceDue` the line of text under it,
// and they are computed independently - which is how "Due today" ended up printed in
// reassuring prose directly beneath a red "Overdue" badge. These pin the two together
// so the pair can't drift apart again.
describe("formatServiceDue agrees with serviceStatus", () => {
  const cases: { name: string; schedule: GearServiceScheduleSummary }[] = [
    { name: "due today", schedule: schedule({ next_due_on: TODAY }) },
    {
      name: "one day overdue",
      schedule: schedule({ next_due_on: "2026-08-09" }),
    },
    {
      name: "out of dives exactly",
      schedule: schedule({ next_due_at_dive_count: 140 }),
    },
  ];

  for (const { name, schedule: s } of cases) {
    it(`describes "${name}" as overdue in both the badge and the text`, () => {
      const diveCount = s.next_due_at_dive_count ?? 0;
      expect(serviceStatus(s, diveCount, TODAY)).toBe("overdue");
      expect(formatServiceDue(s, diveCount, TODAY)).toMatch(/^Overdue/);
    });
  }

  it("does not call anything still in the future overdue", () => {
    const s = schedule({ next_due_on: "2026-08-11" });
    expect(serviceStatus(s, 0, TODAY)).not.toBe("overdue");
    expect(formatServiceDue(s, 0, TODAY)).not.toMatch(/Overdue/);
  });
});

describe("defaultSchedulesForGearType", () => {
  it("suggests both cylinder tests, on their different clocks", () => {
    const presets = defaultSchedulesForGearType("cylinder");
    expect(presets).toEqual([
      { kind: "visual_inspection", interval_months: 12 },
      { kind: "hydrostatic_test", interval_months: 60 },
    ]);
  });

  it("suggests both interval arms for a regulator", () => {
    expect(defaultSchedulesForGearType("regulator")).toEqual([
      { kind: "service", interval_months: 12, interval_dives: 100 },
    ]);
  });

  it("suggests nothing for gear with no convention, or no type", () => {
    expect(defaultSchedulesForGearType("mask")).toEqual([]);
    expect(defaultSchedulesForGearType(null)).toEqual([]);
    expect(defaultSchedulesForGearType(undefined)).toEqual([]);
    expect(defaultSchedulesForGearType("")).toEqual([]);
  });

  it("tolerates a gear type this build doesn't know about", () => {
    expect(defaultSchedulesForGearType("rebreather")).toEqual([]);
  });
});
