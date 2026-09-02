import { describe, expect, it } from "vitest";
import { cn, getUserInitials } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });

  it("resolves conflicting Tailwind classes, keeping the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values", () => {
    expect(cn("px-2", false, undefined, null, "py-4")).toBe("px-2 py-4");
  });
});

describe("getUserInitials", () => {
  it("returns the first letter of the first two words, uppercased", () => {
    expect(getUserInitials("jane doe")).toBe("JD");
  });

  it("handles a single-word name", () => {
    expect(getUserInitials("jane")).toBe("J");
  });

  it("truncates to two characters for names with more than two words", () => {
    expect(getUserInitials("jane q doe")).toBe("JQ");
  });
});
