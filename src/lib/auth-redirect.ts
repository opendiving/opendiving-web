// Where a visitor should land once they've signed in, and how that destination
// survives the trip through their inbox.
//
// Three different lifetimes, of which this file stores one:
//   - In-page sign-in - the six-digit code, and a passkey ceremony - never leaves
//     the tab, so the destination is just passed down as a prop. No storage.
//   - The email magic link leaves the app entirely and comes back on
//     `/auth/verify`, a page that has no idea where the visitor was originally
//     headed. `localStorage` carries it across that hop, under the single
//     read-once key below.
//   - Google leaves the tab too, and comes back on `/auth/google/callback`. Its
//     destination is *not* stored here: it rides inside the per-attempt record
//     `lib/google-oauth.ts` keeps, keyed by that attempt's `state`. The single
//     key below would be the wrong home for it, because two tabs signing in at
//     once would overwrite each other's - tab A would then sign in perfectly and
//     land on tab B's page, with nothing anywhere reporting a problem. Only the
//     sanitizing below is shared with that flow.
//
// `localStorage` (not `sessionStorage`) because the link is clicked from a mail
// client, and that practically never reuses the tab that asked for it: a desktop
// mail app hands the URL to the browser, and webmail opens it with `noopener`.
// Either way the destination lands in a browsing context with no opener, and a
// `sessionStorage` entry - which is copied only from an opener - isn't there.
// The value that used to be stored was therefore lost in the ordinary case, and
// every magic-link sign-in fell through to `/dashboard`.
//
// What's stored is still only a path the visitor's own browser was already
// pointed at, and it's still read exactly once, but `localStorage` outlives the
// tab - so it carries its own expiry rather than relying on the tab closing.
// `lib/gas-use-view.ts` and the two other remembered-view modules store their
// preferences the same way, for a related reason.

import type { AuthStatus } from "@/lib/api/auth";

const POST_AUTH_REDIRECT_KEY = "opendiving:post-auth-redirect";

// A backstop, not a mirror of the link's own life. The obvious value would be
// `MAGIC_LINK_TOKEN_EXPIRE_MINUTES`, but that's read from the environment on the
// backend (30 is only its default) and nothing here can see it - so matching it
// by hand would mean an operator who raises it to an hour silently reintroduces
// the bug this storage exists to fix, with every sign-in in the back half of the
// window landing on `/dashboard` again.
//
// The asymmetry decides it: too short breaks the feature, too long costs
// essentially nothing. A destination can only be *read* by `/auth/verify`, which
// needs a live token, and a live token means a link request, which re-stamps
// this entry anyway. So the expiry is only there to stop an abandoned path
// living in storage forever, and a day is long enough to be safely past any
// plausible link lifetime.
const POST_AUTH_REDIRECT_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredRedirect {
  path: string;
  expiresAt: number;
}

// Where every auth entry point sends a freshly signed-in user when there's no
// remembered destination.
export const DEFAULT_POST_AUTH_REDIRECT = "/dashboard";

// The two destinations that are not a sign-in: a verified identity with no account
// yet, and an account inside its deletion grace period. Both are screens that ask for
// one more explicit decision before there is a session.
export const ONBOARDING_PATH = "/onboarding";
export const RESTORE_PATH = "/restore";

// Where an applied `AuthOutcome` sends the visitor, in the one place that decides it.
//
// Four entry points reach this - the magic link, the six-digit code, Google and a
// passkey - and every one of them used to branch on a boolean that had only ever had
// two possible values. A third status arriving at four separate ternaries is four
// chances to route somebody holding no onboarding token into the onboarding form, so
// the mapping lives here and the call sites pass a status.
//
// `next` is only honoured for a sign-in, and is sanitized here rather than at each
// call site: two of them read it out of `localStorage` - the magic link from the key
// in this file, Google from its own per-attempt record - and the rest take it from a
// prop, and none should have to remember. The other two statuses drop it, exactly
// as they always have - a brand-new account has nothing to return to, and neither has
// an account that isn't back yet. Both screens end at the default.
export function destinationForOutcome(
  status: AuthStatus,
  next?: string | null,
): string {
  switch (status) {
    case "onboarding_required":
      return ONBOARDING_PATH;
    case "deletion_pending":
      return RESTORE_PATH;
    // Exhaustive on purpose: a fourth status added to `AuthStatus` is a type error
    // here, in the one file, rather than a silent mis-route in four.
    case "authenticated":
      return sanitizeRedirectPath(next) ?? DEFAULT_POST_AUTH_REDIRECT;
  }
}

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
// remembered one, so a destination abandoned earlier (e.g. the visitor opened
// `/signin?next=/dives/abc`, then signed in from the landing page instead) can
// never hijack a later sign-in.
export function rememberPostAuthRedirect(path?: string | null): void {
  const target = sanitizeRedirectPath(path);
  try {
    if (target) {
      const stored: StoredRedirect = {
        path: target,
        expiresAt: Date.now() + POST_AUTH_REDIRECT_TTL_MS,
      };
      window.localStorage.setItem(
        POST_AUTH_REDIRECT_KEY,
        JSON.stringify(stored),
      );
    } else {
      window.localStorage.removeItem(POST_AUTH_REDIRECT_KEY);
    }
  } catch {
    // Storage can be unavailable (Safari private mode, storage disabled, quota).
    // Losing the destination just means landing on the default - not worth
    // failing the sign-in over.
  }
}

// Reads and clears the remembered destination. Single-use by design: it's
// consumed by whichever page finishes the sign-in, so it can't leak into the
// next one. Removed before it's even inspected, so a stale, expired or
// unparseable entry clears itself out too rather than sitting there being
// rejected on every subsequent sign-in.
export function consumePostAuthRedirect(): string | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(POST_AUTH_REDIRECT_KEY);
    window.localStorage.removeItem(POST_AUTH_REDIRECT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    // Anything that isn't the shape written above is treated as absent: an entry
    // left by an older build stored the bare path, and `JSON.parse` throws on it.
    const stored: unknown = JSON.parse(raw);
    if (typeof stored !== "object" || stored === null) return null;
    const { path, expiresAt } = stored as Partial<StoredRedirect>;
    if (typeof path !== "string" || typeof expiresAt !== "number") return null;
    if (Date.now() > expiresAt) return null;
    return sanitizeRedirectPath(path);
  } catch {
    return null;
  }
}
