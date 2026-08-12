// Where a visitor should land once they've signed in, and how that destination
// survives the trip through their inbox.
//
// Two very different lifetimes are handled here:
//   - In-page sign-in (Google) never leaves the tab, so the destination is just
//     passed down as a prop (`AuthForm` -> `GoogleAuthButton`) - no storage.
//   - The email magic link leaves the app entirely and comes back on
//     `/auth/verify`, a page that has no idea where the visitor was originally
//     headed. `sessionStorage` carries it across that hop.
//
// `sessionStorage` (not `localStorage`) deliberately: it's scoped to the tab and
// dies with it, and all it ever holds is a path the visitor's own browser was
// already pointed at. If the emailed link is opened in a different browser or
// tab the value simply isn't there, and they land on `/dashboard` - a fine
// outcome, not an error case.

const POST_AUTH_REDIRECT_KEY = "opendiving:post-auth-redirect";

// Where every auth entry point sends a freshly signed-in user when there's no
// remembered destination.
export const DEFAULT_POST_AUTH_REDIRECT = "/dashboard";

// Anything a browser could read as *another* origin - `//evil.example`, an
// absolute URL, or the backslash variants some parsers normalise to `//`.
const OTHER_ORIGIN_PREFIX_REGEX = /^\/[/\\]/;

// Characters the WHATWG URL parser discards *before* it parses, which is what
// lets them hide a leading `//` from a naive prefix check: it strips ASCII tab,
// LF and CR from anywhere in the input, and trims leading/trailing C0 controls
// and spaces. So `"/\t/evil.example"` passes a `startsWith("//")` test and then
// resolves to `https://evil.example/` anyway - a working open redirect.
//
// No legitimate destination this app produces contains any of these; a real
// path percent-encodes them. So the whole C0-and-space range (plus DEL) is
// rejected rather than stripped - patching the value up would only move the
// guesswork somewhere else.
function isStrippedByUrlParser(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    // C0 controls and space (0x00-0x20), plus DEL (0x7f). Written as code
    // points rather than a regex character class so the range stays readable
    // and no literal control bytes end up in this file.
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

// Only same-origin, path-relative destinations are ever honoured. Anything else
// is rejected outright rather than patched up, so a hand-crafted `?next=` can't
// turn our own sign-in page into an open redirect.
export function sanitizeRedirectPath(
  value: string | null | undefined,
): string | null {
  if (!value || !value.startsWith("/")) return null;
  if (isStrippedByUrlParser(value)) return null;
  if (OTHER_ORIGIN_PREFIX_REGEX.test(value)) return null;
  return value;
}

// Builds the sign-in URL for a signed-out visitor who was trying to reach
// `next`. The `next` parameter is omitted when there's nothing worth coming
// back to (the landing page, or a destination that failed sanitizing), so the
// common case stays a clean `/signin`.
export function signInHref(next?: string | null): string {
  const target = sanitizeRedirectPath(next);
  if (!target || target === "/" || target.startsWith("/signin")) {
    return "/signin";
  }
  return `/signin?next=${encodeURIComponent(target)}`;
}

// Stores the destination to return to after the magic-link round trip. Always
// call this when requesting a link - passing no path *clears* any previously
// remembered one, so a destination abandoned earlier in the tab (e.g. the
// visitor opened `/signin?next=/dives/abc`, then signed in from the landing
// page instead) can never hijack a later sign-in.
export function rememberPostAuthRedirect(path?: string | null): void {
  const target = sanitizeRedirectPath(path);
  try {
    if (target) {
      window.sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, target);
    } else {
      window.sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
    }
  } catch {
    // Storage can be unavailable (Safari private mode, storage disabled, quota).
    // Losing the destination just means landing on the default - not worth
    // failing the sign-in over.
  }
}

// Reads and clears the remembered destination. Single-use by design: it's
// consumed by whichever page finishes the sign-in, so it can't leak into the
// next one.
export function consumePostAuthRedirect(): string | null {
  try {
    const stored = window.sessionStorage.getItem(POST_AUTH_REDIRECT_KEY);
    window.sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
    return sanitizeRedirectPath(stored);
  } catch {
    return null;
  }
}
