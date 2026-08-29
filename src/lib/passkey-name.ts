// What a browser is called, read from a User-Agent string, for the two places on
// the settings page that have to name one: the label a new passkey is filed
// under, and the device hint on a signed-in session's row.
//
// Only the client names a passkey: the server sees a User-Agent header it has no
// business parsing, and asking the diver to type a name before the biometric
// prompt puts a form in front of a one-tap gesture. So the ceremony names it
// "Chrome on macOS" and the settings card offers a rename afterwards, which is
// where a diver who wants "Work laptop" goes.
//
// A session row is the same question from the other end. There the API *does*
// store the raw header - an audit trail wants the string it actually saw - and
// hands it back on the diver's own rows, but the label is still derived here, so
// that one browser cannot be called two different things on one settings page.
// That is the whole reason both readers share these tables rather than the
// server growing a second, diverging copy of them.
//
// Deliberately a coarse read of the UA string rather than a UA-parsing
// dependency. What this is for is telling *this* passkey, or *this* device,
// apart from the two others on the account, so a wrong-but-plausible answer
// costs a rename and a missing one costs nothing - the fallback is a label, not
// an error.

// The API's own cap (`NAME_MAX_LENGTH` in its `webauthn_credential` schema). No
// suggestion here comes close, but a caller passing this to the rename field
// should have one number to check against.
export const PASSKEY_NAME_MAX_LENGTH = 50;

// The two fallbacks, which is the only thing the two readers do differently.
//
// A passkey falls back to the word for what it is, because that string becomes a
// *name* the diver can rename. A session cannot be renamed and is not a passkey,
// so "Passkey" there would be a plain falsehood on a row describing a curl
// client or a browser that trimmed its UA to nothing - hence a device-shaped
// answer that admits it does not know.
const FALLBACK_PASSKEY_NAME = "Passkey";
const FALLBACK_DEVICE_NAME = "Unknown device";

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

// The whole reading, with only the last resort left to the caller. Everything a
// UA string is actually recognized by is shared: the two exported wrappers
// differ on nothing but what to say when it is recognized by nothing at all.
function nameForUserAgent(userAgent: string, fallback: string): string {
  const platform = firstMatch(PLATFORMS, userAgent);
  const browser = firstMatch(BROWSERS, userAgent);

  // On iOS every browser is WebKit wearing a different badge, so "Chrome on
  // iPhone" and "Safari on iPhone" describe the same authenticator - the device
  // is the whole answer.
  if (platform === "iPhone" || platform === "iPad") return platform;

  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform ?? fallback;
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
  return nameForUserAgent(userAgent, FALLBACK_PASSKEY_NAME);
}

/**
 * The device hint on a signed-in session's row, read from the raw User-Agent
 * string the API stored when that session was created - the same reading as
 * `passkeyNameForUserAgent`, differing only in what an unrecognized string
 * becomes.
 *
 * The API sends the empty string where the client sent no header at all, which
 * lands here as the fallback like any other unreadable value - a row that cannot
 * be named is still a row that has to be revocable.
 */
export function deviceNameForUserAgent(userAgent: string): string {
  return nameForUserAgent(userAgent, FALLBACK_DEVICE_NAME);
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
