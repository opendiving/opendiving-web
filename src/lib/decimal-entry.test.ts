import { describe, expect, it } from "vitest";

import { decimalEntryMessage, parseDecimal } from "./decimal-entry";

describe("parseDecimal", () => {
  it.each([
    ["1.5", 1.5],
    ["1,5", 1.5],
    ["30", 30],
    [" 12,25 ", 12.25],
    [".5", 0.5],
    [",5", 0.5],
    ["1.", 1],
    ["1,", 1],
    ["-3,5", -3.5],
  ])("reads %j as %d", (text, value) => {
    expect(parseDecimal(text)).toBe(value);
  });

  it.each(["", "abc", "1.2.3", "1,2,3", "1.234,5", "1,234.5", "-", "1e3"])(
    "refuses %j",
    (text) => {
      expect(parseDecimal(text)).toBeNaN();
    },
  );
});

describe("decimalEntryMessage", () => {
  it("has nothing to say about an empty box", () => {
    expect(decimalEntryMessage("  ", 0, 100)).toBe("");
  });

  it("asks for a number when the text is not one", () => {
    expect(decimalEntryMessage("1,2,3", 0, 100)).toBe("Enter a number.");
  });

  it("names the bound a value falls outside", () => {
    expect(decimalEntryMessage("-1", 0, 100)).toBe("Enter 0 or more.");
    expect(decimalEntryMessage("100,5", 0, 100)).toBe("Enter 100 or less.");
  });

  it("accepts a value on either bound", () => {
    expect(decimalEntryMessage("0", 0, 100)).toBe("");
    expect(decimalEntryMessage("100", 0, 100)).toBe("");
  });
});
