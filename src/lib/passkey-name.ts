// The label a new passkey is filed under, suggested from the browser that is
// creating it.
//
// Only the client can name it: the server sees a User-Agent header it has no
// business parsing, and asking the diver to type a name before the biometric
// prompt puts a form in front of a one-tap gesture. So the ceremony names it
// "Chrome on macOS" and the settings card offers a rename afterwards, which is
// where a diver who wants "Work laptop" goes.
//
// Deliberately a coarse read of the UA string rather than a UA-parsing
// dependency. What this is for is telling *this* passkey apart from the two
// others on the account, so a wrong-but-plausible answer costs a rename and a
// missing one costs nothing - the fallback is a label, not an error.

// The API's own cap (`NAME_MAX_LENGTH` in its `webauthn_credential` schema). No
// suggestion here comes close, but a caller passing this to the rename field
// should have one number to check against.
export const PASSKEY_NAME_MAX_LENGTH = 50;

// What a passkey is called when the UA string says nothing recognizable - an
// unusual browser, or one that has trimmed its UA down to almost nothing.
const FALLBACK_PASSKEY_NAME = "Passkey";

// Order matters in both tables: every Chromium browser says "Chrome", and Chrome
// on iOS says "Safari" as well, so the specific token has to be looked for
// before the generic one it also carries.
const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/\bEdg[A-Za-z]*\//, "Edge"],
  [/\bOPR\/|\bOpera[\s/]/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bCriOS\//, "Chrome"],
  [/\bFxiOS\//, "Firefox"],
  [/\bChrome\//, "Chrome"],
  [/\bFirefox\//, "Firefox"],
  [/\bSafari\//, "Safari"],
];

const PLATFORMS: ReadonlyArray<[RegExp, string]> = [
  [/\bCrOS\b/, "ChromeOS"],
  [/\bAndroid\b/, "Android"],
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bWindows\b/, "Windows"],
  // After the two iOS devices: an iPad in desktop mode reports itself as a Mac,
  // and there is nothing in the UA string left to tell them apart.
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

function firstMatch(
  table: ReadonlyArray<[RegExp, string]>,
  userAgent: string,
): string | null {
  for (const [pattern, label] of table) {
    if (pattern.test(userAgent)) return label;
  }
  return null;
}

/**
 * A default name for a passkey being created, read from a User-Agent string -
 * "Chrome on macOS", or just "iPhone" where the browser adds nothing (every
 * browser on iOS is the same engine, so naming it would be a distinction without
 * a difference).
 *
 * Takes the string rather than reading `navigator` so it can be tested against
 * real UA strings; `suggestPasskeyName()` below is the call sites' version.
 */
export function passkeyNameForUserAgent(userAgent: string): string {
  const platform = firstMatch(PLATFORMS, userAgent);
  const browser = firstMatch(BROWSERS, userAgent);

  // On iOS every browser is WebKit wearing a different badge, so "Chrome on
  // iPhone" and "Safari on iPhone" describe the same authenticator - the device
  // is the whole answer.
  if (platform === "iPhone" || platform === "iPad") return platform;

  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform ?? FALLBACK_PASSKEY_NAME;
}

/**
 * The default name for a passkey created in this browser, right now.
 *
 * Safe to call during a ceremony and nowhere else: it reads `navigator`, so it
 * belongs in an event handler rather than in a render.
 */
export function suggestPasskeyName(): string {
  return passkeyNameForUserAgent(
    typeof navigator === "undefined" ? "" : navigator.userAgent,
  );
}
