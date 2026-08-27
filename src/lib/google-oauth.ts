// Signing in with Google without any of Google's code ever running here.
//
// The browser builds the authorization URL itself and performs a top-level
// navigation to it. Nothing of Google's is fetched, injected or executed on this
// site at any point - not on the sign-in page, not on the callback - so a
// signed-out visitor who never presses the button is never disclosed to Google at
// all. Going to Google is the visitor's own instruction, and it is the only
// contact there is.
//
// A navigation rather than a popup or a form post, deliberately. A popup is
// subject to blockers and to the browser's transient-activation budget; a form
// submission would be governed by `form-action 'self'`, which this app's CSP sets
// and which nothing here widens. A top-level navigation is governed by none of
// the fetch directives, which is why removing `accounts.google.com` from the CSP
// costs this flow nothing.
//
// Two values are minted per attempt and have to survive the round trip through
// Google: a `state`, which proves the callback belongs to a sign-in this browser
// actually started, and a PKCE verifier, whose SHA-256 is committed to in the
// authorization URL and which the API later presents to Google's token endpoint.
// Google returns only a single-use code; it is this app's server that redeems it,
// so nothing identifying anyone passes through the browser.

import { sanitizeRedirectPath } from "@/lib/auth-redirect";

// The OAuth 2.0 authorization endpoint, from Google's OpenID discovery document
// at https://accounts.google.com/.well-known/openid-configuration. The same
// document is what establishes PKCE support for this endpoint - it advertises
// `"code_challenge_methods_supported": ["plain", "S256"]` - since neither of
// Google's web-flow guides mentions PKCE at all. Google's own JavaScript SDK for
// this flow cannot do PKCE; building the URL by hand is what makes it available.
const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

// Where Google returns the visitor. The API derives the same path from its own
// `FRONTEND_URL` and refuses to exchange a code against any other `redirect_uri`,
// which is what turns a misconfigured deployment into this app's own error rather
// than a `redirect_uri_mismatch` from Google that names neither setting.
export const GOOGLE_CALLBACK_PATH = "/auth/google/callback";

const PENDING_ATTEMPTS_KEY = "opendiving:google-sign-in-attempts";

// Long enough for a slow first sign-in, which is the one that most needs to work:
// an account chooser, a password, a second factor and a consent screen, any of
// which can stall on a phone being found. An expired entry means no exchange at
// all (see `consumeGoogleAttempt`), so a bound of "a few minutes" would fail a
// sign-in Google had already approved. It is still an order of magnitude under
// the day `lib/auth-redirect.ts` allows itself - that file's reason for a long
// window, a link read from an inbox at an unknown later time, has no analogue
// here.
const ATTEMPT_TTL_MS = 30 * 60 * 1000;

// What one in-flight sign-in needs to remember about itself.
export interface PendingGoogleAttempt {
  // The PKCE verifier. RFC 7636 §4.1 shape - 43 to 128 characters from the
  // unreserved set - because the API validates the field to exactly that and
  // answers 422 to anything else. Base64url over 32 random bytes qualifies;
  // standard base64 would not, since `+` and `/` are outside the set.
  codeVerifier: string;
  // Where this attempt was headed, sanitized when it was stored. It rides inside
  // the per-attempt record rather than in the magic link's single
  // `opendiving:post-auth-redirect` slot for the reason the map exists at all: a
  // lone key would let a second tab overwrite the first tab's destination, and
  // the first tab would then sign in perfectly and land on the wrong page with
  // nothing anywhere reporting a problem.
  redirectTo: string | null;
  expiresAt: number;
}

// Keyed by `state`, not a single current-attempt record. `localStorage` is shared
// across tabs, so one slot would mean the second of two concurrent sign-ins
// overwrote the first, and whichever callback returned first would then fail its
// `state` check and show an error over a sign-in Google had approved. A map lets
// two tabs each consume their own entry.
type PendingAttempts = Record<string, PendingGoogleAttempt>;

// `{origin}/auth/google/callback`, built from the origin the browser is actually
// on - never from `SITE_URL`. That origin is by definition the one Google will
// see and the one an operator has to register, so deriving it from a setting
// would introduce a second value free to disagree with reality. The same string
// is sent to Google on the way out and to this app's API on the way back, from
// this one derivation, so the two cannot drift.
export function googleRedirectUri(): string {
  return `${window.location.origin}${GOOGLE_CALLBACK_PATH}`;
}

// Base64url, per RFC 4648 §5: the `+/` of standard base64 become `-_` and the
// padding goes. Used for both random tokens and the challenge digest, which is
// what keeps the verifier inside the unreserved set the API enforces.
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// 32 random bytes, which base64url renders as 43 unpadded characters - the exact
// minimum RFC 7636 §4.1 sets for a verifier, and ample entropy for a `state`.
function randomToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

// `crypto.subtle` exists only in a secure context, which is not a constraint
// here: Google accepts a redirect URI only over HTTPS or on localhost, and both
// are secure contexts. A deployment that could not satisfy that cannot register a
// redirect URI and so cannot offer Google sign-in under any design.
async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

// Anything that is not the shape written below reads as absent rather than being
// repaired - a half-parsed attempt cannot complete a sign-in, and an entry left
// by an older build would otherwise sit there being rejected forever.
function asAttempt(value: unknown): PendingGoogleAttempt | null {
  if (typeof value !== "object" || value === null) return null;
  const { codeVerifier, redirectTo, expiresAt } =
    value as Partial<PendingGoogleAttempt>;
  if (typeof codeVerifier !== "string" || typeof expiresAt !== "number") {
    return null;
  }
  return {
    codeVerifier,
    // Sanitized again on the way out, not only on the way in: the value has sat
    // in storage that anything else at this browser could have rewritten.
    redirectTo: sanitizeRedirectPath(redirectTo),
    expiresAt,
  };
}

function readAttempts(): PendingAttempts {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(PENDING_ATTEMPTS_KEY);
  } catch {
    // Storage can be unavailable (Safari private mode, storage disabled, quota).
    return {};
  }
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const attempts: PendingAttempts = {};
    for (const [state, value] of Object.entries(parsed)) {
      const attempt = asAttempt(value);
      if (attempt) attempts[state] = attempt;
    }
    return attempts;
  } catch {
    return {};
  }
}

// Expired entries are dropped here rather than on read, so the map cannot grow
// without bound: every write is also a sweep, and a visitor who abandons attempts
// forever still only ever stores the ones from the last half hour.
function writeAttempts(attempts: PendingAttempts): void {
  const live = Object.entries(attempts).filter(
    ([, attempt]) => attempt.expiresAt > Date.now(),
  );
  try {
    if (live.length === 0) {
      window.localStorage.removeItem(PENDING_ATTEMPTS_KEY);
      return;
    }
    window.localStorage.setItem(
      PENDING_ATTEMPTS_KEY,
      JSON.stringify(Object.fromEntries(live)),
    );
  } catch {
    // As above. A lost attempt fails its own `state` check on return and asks the
    // visitor to try again, which is the right outcome for a browser that cannot
    // remember what it started.
  }
}

interface BeginGoogleSignIn {
  clientId: string;
  // Where the visitor was headed before they were asked to sign in, if anywhere.
  redirectTo?: string | null;
}

/**
 * Mints an attempt, stores it, and returns the URL to navigate to.
 *
 * `access_type` is deliberately never set to `offline`, so Google issues no
 * refresh token and this app is never handed a Google credential it could store.
 * `scope` and `prompt` are parity with what Google's own script used to request
 * from this app.
 *
 * There is no `nonce`. A nonce binds an ID token to the request that asked for
 * it, and the threat it answers is replay of a token that travelled through the
 * browser. Here the ID token never touches the browser: it goes straight from
 * Google's token endpoint to this app's API over TLS, in exchange for a
 * single-use code that cannot be redeemed without both the client secret and the
 * verifier above. Google does not require one for this flow either - OpenID
 * Connect Core marks `nonce` optional for the authorization code flow and
 * required only for the implicit flow, and Google enforces it exactly there.
 */
export async function beginGoogleSignIn({
  clientId,
  redirectTo,
}: BeginGoogleSignIn): Promise<string> {
  const state = randomToken();
  const codeVerifier = randomToken();
  const challenge = await codeChallenge(codeVerifier);

  writeAttempts({
    ...readAttempts(),
    [state]: {
      codeVerifier,
      redirectTo: sanitizeRedirectPath(redirectTo),
      expiresAt: Date.now() + ATTEMPT_TTL_MS,
    },
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTHORIZATION_ENDPOINT}?${params}`;
}

/**
 * Reads and removes the attempt a callback's `state` names, or `null` when there
 * isn't one.
 *
 * `null` is the answer for a `state` this browser never issued, one it has
 * already used, and one that expired - and the caller must perform no exchange in
 * any of those cases. Only this attempt is removed; entries belonging to other
 * tabs are written back untouched.
 *
 * This is not the guard against exchanging a code twice. Google's codes are
 * single-use and React Strict Mode invokes effects twice in development, so the
 * callback needs a latch that survives its own remount - consuming the entry
 * before the request would make the second mount look like a `state` that was
 * never issued, and report a failure over a sign-in that had just succeeded.
 */
export function consumeGoogleAttempt(
  state: string | null | undefined,
): PendingGoogleAttempt | null {
  if (!state) return null;

  const attempts = readAttempts();
  const attempt = attempts[state];
  delete attempts[state];
  writeAttempts(attempts);

  if (!attempt || attempt.expiresAt <= Date.now()) return null;
  return attempt;
}
