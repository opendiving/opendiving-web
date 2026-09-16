import { describe, expect, it } from "vitest";
import { parseDateInput, parseDateTimeInput } from "./date-input";

describe("parseDateInput", () => {
  it("reads the canonical form back unchanged", () => {
    expect(parseDateInput("2024-06-01")).toBe("2024-06-01");
  });

  it("accepts loose separators and single digits", () => {
    for (const text of [
      "2024-6-1",
      "2024/06/01",
      "2024.6.01",
      "2024 06 01",
      "20240601",
      "  2024-06-01  ",
    ]) {
      expect(parseDateInput(text)).toBe("2024-06-01");
    }
  });

  it("refuses a day-first or month-first date rather than guessing", () => {
    // "01/06/2024" is two different days depending on who typed it, and a
    // picker that picks one stores the wrong dive date silently.
    expect(parseDateInput("01/06/2024")).toBeNull();
    expect(parseDateInput("06/01/2024")).toBeNull();
    expect(parseDateInput("1 June 2024")).toBeNull();
  });

  it("refuses a day the month does not have", () => {
    expect(parseDateInput("2024-06-31")).toBeNull();
    expect(parseDateInput("2025-02-29")).toBeNull();
    expect(parseDateInput("2024-02-29")).toBe("2024-02-29");
    expect(parseDateInput("2000-02-29")).toBe("2000-02-29");
    expect(parseDateInput("1900-02-29")).toBeNull();
  });

  it("refuses an impossible month or day", () => {
    expect(parseDateInput("2024-13-01")).toBeNull();
    expect(parseDateInput("2024-00-01")).toBeNull();
    expect(parseDateInput("2024-06-00")).toBeNull();
  });

  it("refuses a half-typed date", () => {
    expect(parseDateInput("2")).toBeNull();
    expect(parseDateInput("2024-")).toBeNull();
    expect(parseDateInput("2024-06")).toBeNull();
    expect(parseDateInput("2024-06-011")).toBeNull();
  });

  it("tells a cleared field from an unreadable one", () => {
    expect(parseDateInput("")).toBe("");
    expect(parseDateInput("   ")).toBe("");
    expect(parseDateInput("soon")).toBeNull();
  });
});

describe("parseDateTimeInput", () => {
  it("reads a date and time in either ISO separator", () => {
    expect(parseDateTimeInput("2024-06-01 10:04:47")).toBe(
      "2024-06-01 10:04:47",
    );
    expect(parseDateTimeInput("2024-06-01T10:04:47")).toBe(
      "2024-06-01 10:04:47",
    );
  });

  it("fills in the parts the diver left off", () => {
    expect(parseDateTimeInput("2024-06-01 10:04")).toBe("2024-06-01 10:04:00");
    expect(parseDateTimeInput("2024-6-1 9:4")).toBe("2024-06-01 09:04:00");
    expect(parseDateTimeInput("2024-06-01")).toBe("2024-06-01 00:00:00");
  });

  it("drops a fraction the field has no room for", () => {
    expect(parseDateTimeInput("2024-06-01T10:04:47.910")).toBe(
      "2024-06-01 10:04:47",
    );
  });

  it("refuses a string carrying a UTC offset", () => {
    // The offset is the dive's own zone and lives in its own control; honouring
    // it here is impossible and dropping it would move the dive by that many
    // hours without saying so.
    expect(parseDateTimeInput("2024-06-01T10:04:47+02:00")).toBeNull();
    expect(parseDateTimeInput("2024-06-01T10:04:47Z")).toBeNull();
  });

  it("refuses an out-of-range time rather than clamping it", () => {
    expect(parseDateTimeInput("2024-06-01 25:00:00")).toBeNull();
    expect(parseDateTimeInput("2024-06-01 10:60:00")).toBeNull();
    expect(parseDateTimeInput("2024-06-01 10:04:60")).toBeNull();
  });

  it("applies the same calendar rules as the date-only field", () => {
    expect(parseDateTimeInput("2025-02-29 10:00")).toBeNull();
    expect(parseDateTimeInput("")).toBe("");
    expect(parseDateTimeInput("tomorrow")).toBeNull();
  });
});
