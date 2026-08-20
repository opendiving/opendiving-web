import { describe, expect, it, afterEach } from "vitest";
import {
  cn,
  checkImageExists,
  getGravatarUrl,
  getGravatarUrlStrict,
  getUserInitials,
} from "./utils";

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

// The digest in the two URL assertions below is SHA-256 of "test@example.com" -
// the normalized (trimmed, lowercased) form of every fixture address here. Its
// length is the algorithm: 64 hex characters is SHA-256, 32 would be the MD5
// this used to send.
describe("getGravatarUrl", () => {
  it("builds a gravatar URL with default size/default-image/rating", () => {
    const url = getGravatarUrl("Test@Example.com");
    expect(url).toBe(
      "https://www.gravatar.com/avatar/973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b?s=80&d=mp&r=g",
    );
  });

  it("trims and lowercases the email before hashing", () => {
    const url1 = getGravatarUrl("  Test@Example.com  ");
    const url2 = getGravatarUrl("test@example.com");
    expect(url1).toBe(url2);
  });

  it("respects custom size/defaultImage/rating", () => {
    const url = getGravatarUrl("test@example.com", 200, "retro", "pg");
    expect(url).toContain("s=200");
    expect(url).toContain("d=retro");
    expect(url).toContain("r=pg");
  });
});

describe("getGravatarUrlStrict", () => {
  it("builds a gravatar URL that 404s when no custom avatar exists", () => {
    const url = getGravatarUrlStrict("test@example.com", 100);
    expect(url).toBe(
      "https://www.gravatar.com/avatar/973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b?s=100&d=404",
    );
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

describe("checkImageExists", () => {
  const originalImage = globalThis.Image;

  afterEach(() => {
    globalThis.Image = originalImage;
  });

  it("resolves true when the image loads successfully", async () => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    // @ts-expect-error - minimal stand-in for the DOM Image constructor
    globalThis.Image = FakeImage;

    await expect(
      checkImageExists("https://example.com/avatar.png"),
    ).resolves.toBe(true);
  });

  it("resolves false when the image fails to load", async () => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    // @ts-expect-error - minimal stand-in for the DOM Image constructor
    globalThis.Image = FakeImage;

    await expect(
      checkImageExists("https://example.com/missing.png"),
    ).resolves.toBe(false);
  });
});
