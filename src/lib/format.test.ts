import { describe, it, expect } from "vitest";
import { formatFileSize } from "./format";

describe("formatFileSize", () => {
  it("rounds a small but non-empty file up to 1 KB", () => {
    // "0 KB" next to a file that uploaded fine reads as a failure.
    expect(formatFileSize(1)).toBe("1 KB");
    expect(formatFileSize(400)).toBe("1 KB");
  });

  it("formats KB below the MB threshold", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(500 * 1024)).toBe("500 KB");
  });

  it("switches to MB at 1024 KB", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(1024 * 1024 - 1)).toMatch(/KB$/);
  });

  it("formats multi-megabyte files with one decimal", () => {
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("switches to GB at 1024 MB", () => {
    expect(formatFileSize(1024 ** 3)).toBe("1.0 GB");
    expect(formatFileSize(1024 ** 3 - 1)).toMatch(/MB$/);
    expect(formatFileSize(2.5 * 1024 ** 3)).toBe("2.5 GB");
  });

  // The API's storage-limit refusal names its figures by this rule and rounds a
  // tie upward, as these do; Python's own `round` would go to even there, so a
  // change to the rounding here is a change the API has to match.
  it("rounds a tie upward in every unit", () => {
    expect(formatFileSize(2.5 * 1024)).toBe("3 KB");
    expect(formatFileSize(1.25 * 1024 ** 2)).toBe("1.3 MB");
    expect(formatFileSize(1.25 * 1024 ** 3)).toBe("1.3 GB");
  });

  it("handles zero and nonsense without throwing", () => {
    expect(formatFileSize(0)).toBe("0 KB");
    expect(formatFileSize(-1)).toBe("0 KB");
    expect(formatFileSize(Number.NaN)).toBe("0 KB");
  });
});
