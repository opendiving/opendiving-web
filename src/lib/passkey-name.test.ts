import { describe, expect, it } from "vitest";
import {
  PASSKEY_NAME_MAX_LENGTH,
  passkeyNameForUserAgent,
} from "./passkey-name";

// Real UA strings, because the whole risk here is in the tokens browsers share:
// every Chromium browser says "Chrome", Chrome on iOS says "Safari" too, and an
// iPad in desktop mode says "Macintosh". A hand-written string would quietly stop
// testing that.
const USER_AGENTS = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  operaWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/125.0.0.0",
  firefoxLinux:
    "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
  chromeOS:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

describe("passkeyNameForUserAgent", () => {
  it("names the browser and the platform", () => {
    expect(passkeyNameForUserAgent(USER_AGENTS.chromeMac)).toBe(
      "Chrome on macOS",
    );
    expect(passkeyNameForUserAgent(USER_AGENTS.safariMac)).toBe(
      "Safari on macOS",
    );
    expect(passkeyNameForUserAgent(USER_AGENTS.firefoxLinux)).toBe(
      "Firefox on Linux",
    );
    expect(passkeyNameForUserAgent(USER_AGENTS.chromeAndroid)).toBe(
      "Chrome on Android",
    );
  });

  // The case the table's ordering exists for: both of these say "Chrome" and
  // "Safari" as well, and a first-match-wins table written the other way round
  // would call every Edge passkey "Chrome on Windows".
  it("prefers the specific Chromium badge over the tokens it also carries", () => {
    expect(passkeyNameForUserAgent(USER_AGENTS.edgeWindows)).toBe(
      "Edge on Windows",
    );
    expect(passkeyNameForUserAgent(USER_AGENTS.operaWindows)).toBe(
      "Opera on Windows",
    );
    expect(passkeyNameForUserAgent(USER_AGENTS.samsungAndroid)).toBe(
      "Samsung Internet on Android",
    );
  });

  // Every browser on iOS is the same WebKit, so naming it would draw a
  // distinction the authenticator doesn't have - and "Android" is the platform
  // token an iOS-first table would have to look past.
  it("names the device alone on iOS, whichever browser is asking", () => {
    expect(passkeyNameForUserAgent(USER_AGENTS.safariIphone)).toBe("iPhone");
    expect(passkeyNameForUserAgent(USER_AGENTS.chromeIphone)).toBe("iPhone");
  });

  // "CrOS" also contains no Linux token, but the string carries X11 - so this
  // pins the order in the platform table too.
  it("calls ChromeOS ChromeOS rather than Linux", () => {
    expect(passkeyNameForUserAgent(USER_AGENTS.chromeOS)).toBe(
      "Chrome on ChromeOS",
    );
  });

  // A name is a label, not an answer that can be wrong: a UA string this doesn't
  // recognise still has to produce something the API will accept.
  it("falls back to a plain label rather than an empty name", () => {
    expect(passkeyNameForUserAgent("")).toBe("Passkey");
    expect(passkeyNameForUserAgent("SomeKiosk/1.0")).toBe("Passkey");
  });

  it("names whichever half it does recognise", () => {
    expect(passkeyNameForUserAgent("Mozilla/5.0 (Windows NT 10.0)")).toBe(
      "Windows",
    );
    expect(passkeyNameForUserAgent("Firefox/135.0")).toBe("Firefox");
  });

  // The API caps the column at 50 characters, and a suggestion it rejects would
  // fail a ceremony the diver already completed.
  it("never suggests a name the API would refuse", () => {
    for (const userAgent of Object.values(USER_AGENTS)) {
      const name = passkeyNameForUserAgent(userAgent);
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(PASSKEY_NAME_MAX_LENGTH);
    }
  });
});
