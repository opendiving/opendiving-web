import { describe, expect, it, vi } from "vitest";
import {
  combineStartTime,
  formatDateOnly,
  formatDateTime,
  formatDateTimeForForm,
  formatDiveDateTime,
  formatDiveTimeOnly,
  formatDurationForForm,
  formatDurationHoursMinutes,
  formatTimeOnly,
  formatTripDateRange,
  formatUtcOffset,
  getBrowserUtcOffsetMinutes,
  parseFormDateTime,
  parseFormDuration,
  parseUtcOffsetMinutes,
  splitStartTime,
} from "./date-time";

describe("formatDateTimeForForm", () => {
  it("formats a Date as YYYY-MM-DD HH:mm:ss", () => {
    const date = new Date(2024, 5, 1, 9, 5, 3); // June 1, 2024, 09:05:03
    expect(formatDateTimeForForm(date)).toBe("2024-06-01 09:05:03");
  });

  it("zero-pads single-digit month/day/hour/minute/second", () => {
    const date = new Date(2024, 0, 2, 3, 4, 5); // Jan 2, 2024, 03:04:05
    expect(formatDateTimeForForm(date)).toBe("2024-01-02 03:04:05");
  });
});

describe("parseFormDateTime", () => {
  it("round-trips with formatDateTimeForForm", () => {
    const original = new Date(2024, 5, 1, 9, 5, 3);
    const formatted = formatDateTimeForForm(original);
    const parsed = parseFormDateTime(formatted);
    expect(parsed.getTime()).toBe(original.getTime());
  });

  it("replaces the space with a T before parsing", () => {
    const parsed = parseFormDateTime("2024-06-01 09:05:03");
    expect(parsed.getFullYear()).toBe(2024);
    expect(parsed.getMonth()).toBe(5);
    expect(parsed.getDate()).toBe(1);
  });
});

describe("formatDateOnly", () => {
  it("formats a bare YYYY-MM-DD string without timezone shifting", () => {
    // Regression: new Date("2024-06-01") parses as UTC midnight, which can
    // display as the previous day in negative-UTC-offset timezones.
    expect(formatDateOnly("2024-06-01")).toBe("Jun 1, 2024");
  });

  it("respects custom Intl.DateTimeFormatOptions", () => {
    expect(
      formatDateOnly("2024-12-25", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    ).toBe("December 25, 2024");
  });

  it("handles the first and last days of a month", () => {
    expect(formatDateOnly("2024-01-01")).toBe("Jan 1, 2024");
    expect(formatDateOnly("2024-12-31")).toBe("Dec 31, 2024");
  });
});

describe("formatDateTime", () => {
  it("formats a full ISO datetime string with date and time by default", () => {
    expect(formatDateTime("2024-06-01T09:05:00")).toMatch(
      /^Jun 1, 2024, \d{1,2}:\d{2} (AM|PM)$/,
    );
  });

  it("respects custom Intl.DateTimeFormatOptions", () => {
    expect(
      formatDateTime("2024-06-01T09:05:00", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    ).toBe("June 1, 2024");
  });
});

describe("formatTimeOnly", () => {
  it("formats a full ISO datetime string's time-of-day component", () => {
    expect(formatTimeOnly("2024-06-01T09:05:00")).toMatch(
      /^\d{1,2}:\d{2} (AM|PM)$/,
    );
  });
});

describe("parseUtcOffsetMinutes", () => {
  it("parses a positive +HH:MM offset", () => {
    expect(parseUtcOffsetMinutes("2021-04-04T10:04:47.910+02:00")).toBe(120);
  });

  it("parses a negative -HH:MM offset", () => {
    expect(parseUtcOffsetMinutes("2024-01-01T06:00:00-05:00")).toBe(-300);
  });

  it("parses a non-hour-aligned offset", () => {
    expect(parseUtcOffsetMinutes("2024-01-01T06:00:00+05:45")).toBe(345);
  });

  it('parses a "Z" suffix as a zero offset', () => {
    expect(parseUtcOffsetMinutes("2024-01-01T06:00:00Z")).toBe(0);
  });

  it("returns null for a naive datetime with no offset", () => {
    expect(parseUtcOffsetMinutes("2025-06-03T12:15:33.8")).toBeNull();
    expect(parseUtcOffsetMinutes("2024-05-01T09:00:00")).toBeNull();
  });
});

describe("formatUtcOffset", () => {
  it("formats a positive offset", () => {
    expect(formatUtcOffset(120)).toBe("+02:00");
  });

  it("formats a negative offset", () => {
    expect(formatUtcOffset(-300)).toBe("-05:00");
  });

  it("formats a zero offset", () => {
    expect(formatUtcOffset(0)).toBe("+00:00");
  });

  it("formats a non-hour-aligned offset", () => {
    expect(formatUtcOffset(345)).toBe("+05:45");
  });
});

describe("getBrowserUtcOffsetMinutes", () => {
  it("negates Date.prototype.getTimezoneOffset()", () => {
    const spy = vi
      .spyOn(Date.prototype, "getTimezoneOffset")
      .mockReturnValue(-120); // e.g. UTC+02:00
    expect(getBrowserUtcOffsetMinutes()).toBe(120);
    spy.mockRestore();
  });
});

describe("splitStartTime/combineStartTime", () => {
  it("splits an offset-aware ISO string into wall-clock + offset", () => {
    const { localDateTime, offsetMinutes } = splitStartTime(
      "2021-04-04T10:04:47+02:00",
    );
    expect(localDateTime).toBe("2021-04-04 10:04:47");
    expect(offsetMinutes).toBe(120);
  });

  it("never converts through the browser's own timezone", () => {
    // Regardless of what Date.prototype.getTimezoneOffset() the environment
    // running this test happens to report, the *wall-clock* digits read back
    // out must exactly match what was embedded in the string.
    const spy = vi
      .spyOn(Date.prototype, "getTimezoneOffset")
      .mockReturnValue(300); // e.g. UTC-05:00
    const { localDateTime, offsetMinutes } = splitStartTime(
      "2021-04-04T10:04:47+02:00",
    );
    expect(localDateTime).toBe("2021-04-04 10:04:47");
    expect(offsetMinutes).toBe(120);
    spy.mockRestore();
  });

  it("defaults to a UTC offset for a naive string with none", () => {
    const { offsetMinutes } = splitStartTime("2024-05-01T09:00:00");
    expect(offsetMinutes).toBe(0);
  });

  it("combineStartTime is the inverse of splitStartTime", () => {
    expect(combineStartTime("2021-04-04 10:04:47", 120)).toBe(
      "2021-04-04T10:04:47+02:00",
    );
  });

  it("round-trips split -> combine", () => {
    const original = "2024-01-01T06:00:00-05:00";
    const { localDateTime, offsetMinutes } = splitStartTime(original);
    expect(combineStartTime(localDateTime, offsetMinutes)).toBe(original);
  });
});

describe("formatDiveDateTime/formatDiveTimeOnly", () => {
  it("displays a dive's own offset, not the browser's", () => {
    const spy = vi
      .spyOn(Date.prototype, "getTimezoneOffset")
      .mockReturnValue(300); // e.g. UTC-05:00
    expect(
      formatDiveTimeOnly("2021-04-04T10:04:47+02:00", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    ).toBe("10:04");
    spy.mockRestore();
  });

  it("formats the date component in the dive's own timezone", () => {
    expect(
      formatDiveDateTime("2021-04-04T23:30:00+02:00", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    ).toBe("Apr 4, 2021");
  });
});

describe("formatDurationForForm", () => {
  it("formats seconds as MM:SS", () => {
    expect(formatDurationForForm(45 * 60 + 30)).toBe("45:30");
  });

  it("zero-pads seconds under 10", () => {
    expect(formatDurationForForm(60 + 5)).toBe("1:05");
  });

  it("formats zero seconds", () => {
    expect(formatDurationForForm(0)).toBe("0:00");
  });
});

describe("parseFormDuration", () => {
  it("parses MM:SS into total seconds", () => {
    expect(parseFormDuration("45:30")).toBe(45 * 60 + 30);
  });

  it("round-trips with formatDurationForForm", () => {
    const seconds = 125;
    expect(parseFormDuration(formatDurationForForm(seconds))).toBe(seconds);
  });
});

describe("formatDurationHoursMinutes", () => {
  it("formats sub-hour durations as minutes only", () => {
    expect(formatDurationHoursMinutes(45 * 60)).toBe("45min");
  });

  it("formats hour-plus durations with remaining minutes", () => {
    expect(formatDurationHoursMinutes(90 * 60)).toBe("1h 30min");
  });

  it("omits minutes when the duration is an exact number of hours", () => {
    expect(formatDurationHoursMinutes(120 * 60)).toBe("2h");
  });

  it("rounds to the nearest minute", () => {
    expect(formatDurationHoursMinutes(59.6 * 60)).toBe("1h");
  });
});

describe("formatTripDateRange", () => {
  it("returns undefined when neither date is set", () => {
    expect(formatTripDateRange(undefined, undefined)).toBeUndefined();
  });

  it("omits the year from the start date when both dates share a year", () => {
    expect(formatTripDateRange("2024-06-01", "2024-06-08")).toBe(
      "Jun 1 - Jun 8, 2024",
    );
  });

  it("includes the year on both dates when they span different years", () => {
    expect(formatTripDateRange("2024-12-30", "2025-01-02")).toBe(
      "Dec 30, 2024 - Jan 2, 2025",
    );
  });

  it("formats just the start date when only start_date is set", () => {
    expect(formatTripDateRange("2024-06-01", undefined)).toBe("Jun 1, 2024");
  });

  it("formats just the end date when only end_date is set", () => {
    expect(formatTripDateRange(undefined, "2024-06-08")).toBe("Jun 8, 2024");
  });
});
