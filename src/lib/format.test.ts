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

  it("handles zero and nonsense without throwing", () => {
    expect(formatFileSize(0)).toBe("0 KB");
    expect(formatFileSize(-1)).toBe("0 KB");
    expect(formatFileSize(Number.NaN)).toBe("0 KB");
  });
});
