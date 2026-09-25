import { describe, expect, it, vi } from "vitest";
import {
  combineStartTime,
  formatDateOnly,
  formatDateTime,
  formatDateTimeForForm,
  formatDiveDateTime,
  formatDiveStartTime,
  formatDiveTimeOnly,
  formatDurationForForm,
  formatDurationHoursMinutes,
  formatTimeOnly,
  formatTripDateRange,
  formatUtcOffset,
  getBrowserUtcOffsetMinutes,
  diveWallClockTime,
  greetingForHour,
  isDateOnlyStartTime,
  normalizeParsedStartTime,
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
  it("formats a full ISO datetime string with date and time in 24h format by default", () => {
    expect(formatDateTime("2024-06-01T09:05:00")).toBe("Jun 1, 2024, 09:05");
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
  it("formats a full ISO datetime string's time-of-day component in 24h format", () => {
    expect(formatTimeOnly("2024-06-01T09:05:00")).toBe("09:05");
  });

  it("formats an afternoon time in 24h format, not AM/PM", () => {
    expect(formatTimeOnly("2024-06-01T15:30:00")).toBe("15:30");
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

  // A bare date ends in "-DD", which reads exactly like a "-HH" offset. Some
  // dive computers export `start_time` this way, and treating the day as an
  // offset would shift the dive by that many hours.
  it("does not read a bare date's day as an offset", () => {
    expect(parseUtcOffsetMinutes("2021-04-04")).toBeNull();
    expect(parseUtcOffsetMinutes("2024-05-01")).toBeNull();
    expect(parseUtcOffsetMinutes("2024-05-12")).toBeNull();
  });

  it("parses offsets written without a colon, or with hours only", () => {
    expect(parseUtcOffsetMinutes("2024-05-01T09:00:00+0200")).toBe(120);
    expect(parseUtcOffsetMinutes("2024-05-01T09:00:00+02")).toBe(120);
    expect(parseUtcOffsetMinutes("2024-05-01T09:00+02:00")).toBe(120);
  });
});

describe("normalizeParsedStartTime", () => {
  const browserOffset = formatUtcOffset(getBrowserUtcOffsetMinutes());

  it("passes an already offset-aware start_time through untouched", () => {
    expect(normalizeParsedStartTime("2021-04-04T10:04:47.910+02:00")).toBe(
      "2021-04-04T10:04:47.910+02:00",
    );
  });

  it("gives a naive datetime the browser's offset, keeping its digits", () => {
    expect(normalizeParsedStartTime("2025-06-03T12:15:33")).toBe(
      `2025-06-03T12:15:33${browserOffset}`,
    );
  });

  // The whole point of the date-only branch: `new Date("2021-04-04")` is UTC
  // midnight, so going through it would report 2021-04-03 anywhere west of
  // Greenwich. The date must survive verbatim.
  it("takes a date-only start_time as local midnight on that same date", () => {
    expect(normalizeParsedStartTime("2021-04-04")).toBe(
      `2021-04-04T00:00:00${browserOffset}`,
    );
    expect(normalizeParsedStartTime("2024-05-12")).toBe(
      `2024-05-12T00:00:00${browserOffset}`,
    );
  });

  it("returns undefined for something that isn't a datetime at all", () => {
    expect(normalizeParsedStartTime("not a date")).toBeUndefined();
    expect(normalizeParsedStartTime("")).toBeUndefined();
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

  // This used to assert `0` - "defaults to a UTC offset for a naive string with
  // none" - and that default is the bug rather than the behaviour. An imported
  // dive whose zone was never recorded arrives naive, and collapsing it to UTC
  // both moved the clock and invented a zone the first save then wrote down.
  it("reports a null offset for a string carrying none, rather than UTC", () => {
    const { offsetMinutes } = splitStartTime("2024-05-01T09:00:00");
    expect(offsetMinutes).toBeNull();
  });

  it("keeps a naive string's wall clock exactly as written", () => {
    // Load-bearing only outside UTC, and deliberately written anyway: the old
    // code read a naive value through `new Date()`, which ECMAScript parses as
    // *local*, so these digits came back shifted by whatever offset the reader
    // happened to be sitting in - and came back correct, by luck, in UTC. The
    // round-trip below is the assertion that fails in every zone.
    const { localDateTime } = splitStartTime("2026-04-17T11:49:23");
    expect(localDateTime).toBe("2026-04-17 11:49:23");
  });

  it("round-trips a naive string back to itself, offset and all", () => {
    // The one that fails in **every** timezone, UTC included, and the one that
    // matters: this is the save path. Under the old code UTC produced
    // "2026-04-17T11:49:23+00:00" - the right hour with a fabricated zone welded
    // on - and every other zone produced a wrong hour as well.
    const original = "2026-04-17T11:49:23";
    const { localDateTime, offsetMinutes } = splitStartTime(original);
    expect(combineStartTime(localDateTime, offsetMinutes)).toBe(original);
  });

  it("writes no offset when combining with a null one", () => {
    expect(combineStartTime("2026-04-17 11:49:23", null)).toBe(
      "2026-04-17T11:49:23",
    );
  });

  it("adopts a real offset chosen from the unknown state, keeping the clock", () => {
    // The only exit from the unknown state, and the diver's own deliberate act:
    // the wall clock they were shown is the wall clock that gets the zone.
    const { localDateTime } = splitStartTime("2026-04-17T11:49:23");
    expect(combineStartTime(localDateTime, 180)).toBe(
      "2026-04-17T11:49:23+03:00",
    );
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

  // The save path for a dive whose time of day was never recorded, and it fails
  // in every zone if the date goes through `Date`: UTC gives back
  // "2002-06-18T00:00:00", a midnight the API would store as the dive's time.
  it("round-trips a bare date back to itself, with no time and no offset", () => {
    const { localDateTime, offsetMinutes } = splitStartTime("2002-06-18");
    expect(localDateTime).toBe("2002-06-18");
    expect(offsetMinutes).toBeNull();
    expect(combineStartTime(localDateTime, offsetMinutes)).toBe("2002-06-18");
  });
});

describe("isDateOnlyStartTime", () => {
  it("is true for a bare date and nothing else", () => {
    expect(isDateOnlyStartTime("2002-06-18")).toBe(true);
    expect(isDateOnlyStartTime("2002-06-18T00:00:00")).toBe(false);
    expect(isDateOnlyStartTime("2002-06-18T10:00:00+02:00")).toBe(false);
    expect(isDateOnlyStartTime("")).toBe(false);
    expect(isDateOnlyStartTime(undefined)).toBe(false);
    expect(isDateOnlyStartTime(null)).toBe(false);
  });
});

describe("a dive whose time of day was never recorded", () => {
  it("lists as its date, with no clock", () => {
    // The default options ask for an hour and a minute; a bare date has neither
    // and would print "00:00" in every zone.
    expect(formatDiveDateTime("2002-06-18")).toBe("Jun 18, 2002");
    expect(
      formatDiveDateTime("2002-06-18", { hour: "2-digit", minute: "2-digit" }),
    ).toBe("Jun 18, 2002");
    expect(
      formatDiveDateTime("2002-06-18", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    ).toBe("Jun 18, 2002");
  });

  it("heads its page with the date and stops", () => {
    const line = formatDiveStartTime("2002-06-18");
    expect(line).toBe("Tuesday, June 18, 2002");
    expect(line).not.toMatch(/ at |UTC/);
  });

  it("sits at the start of its own day on a timeline", () => {
    const at = new Date(diveWallClockTime("2002-06-18"));
    expect(at.toISOString()).toBe("2002-06-18T00:00:00.000Z");
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

describe("formatDiveStartTime", () => {
  it("puts the date, the wall-clock time and the offset on one line", () => {
    expect(formatDiveStartTime("2021-04-04T10:04:47+02:00")).toBe(
      "Sunday, April 4, 2021 at 10:04 (UTC+02:00)",
    );
  });

  it("reads the dive's own offset rather than the browser's", () => {
    // The whole point of the dive-specific formatters: a dive logged at 09:00 in
    // Thailand reads 09:00 from anywhere, and the header has to name the offset it
    // is quoting or the number is unverifiable.
    const spy = vi
      .spyOn(Date.prototype, "getTimezoneOffset")
      .mockReturnValue(300); // e.g. UTC-05:00

    expect(formatDiveStartTime("2021-04-04T09:00:00+07:00")).toBe(
      "Sunday, April 4, 2021 at 09:00 (UTC+07:00)",
    );

    spy.mockRestore();
  });

  it("keeps the date on the dive's own side of midnight", () => {
    // 23:30+02:00 is the 4th where the dive happened and the 4th at 21:30 UTC, so
    // this only bites where the offset would carry it over - here, a negative one.
    expect(formatDiveStartTime("2021-04-04T23:30:00-05:00")).toBe(
      "Sunday, April 4, 2021 at 23:30 (UTC-05:00)",
    );
  });

  it("claims no zone at all for a dive whose offset was never recorded", () => {
    // Fails in every timezone under the old code, which appended "(UTC+00:00)"
    // unconditionally - a statement about where the dive happened that nothing
    // in the record supports. The clock is what was written down; the zone is
    // genuinely not known, and the header says so by saying nothing.
    const line = formatDiveStartTime("2026-04-17T11:49:23");
    expect(line).toBe("Friday, April 17, 2026 at 11:49");
    expect(line).not.toMatch(/UTC/);
  });
});

describe("greetingForHour", () => {
  it("greets the morning from 04:00 until noon", () => {
    expect(greetingForHour(4)).toBe("Good morning");
    expect(greetingForHour(11)).toBe("Good morning");
  });

  it("greets the afternoon from noon until 18:00", () => {
    expect(greetingForHour(12)).toBe("Good afternoon");
    expect(greetingForHour(17)).toBe("Good afternoon");
  });

  it("greets the evening from 18:00 onwards", () => {
    expect(greetingForHour(18)).toBe("Good evening");
    expect(greetingForHour(23)).toBe("Good evening");
  });

  it("keeps the small hours in the evening", () => {
    expect(greetingForHour(0)).toBe("Good evening");
    expect(greetingForHour(3)).toBe("Good evening");
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

  it("reads a colonless value as whole minutes", () => {
    expect(parseFormDuration("45")).toBe(45 * 60);
    expect(parseFormDuration("0")).toBe(0);
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
