// Which way in the diver used last time, so the sign-in form can say so.
//
// A login screen offering three methods creates one specific confusion - "which
// of these did I use?" - and the answer is cheap to keep: the browser that signed
// in is the browser that comes back. This is a hint and nothing more. It never
// hides a method, never preselects one, and is wrong harmlessly on a shared
// machine, where it names the last sign-in rather than the reader's own.
//
// `localStorage`, not a server flag or the user record: the answer belongs to the
// browser, it has to be readable while signed *out*, and nothing about it is
// worth an endpoint. It carries no address and no identity - only which of three
// buttons was pressed - which is why it needs no expiry.

const LAST_AUTH_METHOD_KEY = "opendiving:last-auth-method";

// The three ways into the app. The email link and the code printed in the same
// email are one method here: they claim the same request row, they arrive in the
// same message, and "you signed in with your email" is true of both.
export const AUTH_METHODS = ["email", "google", "passkey"] as const;

export type AuthMethod = (typeof AUTH_METHODS)[number];

/** Records the method that just proved the diver's identity. */
export function rememberAuthMethod(method: AuthMethod): void {
  try {
    window.localStorage.setItem(LAST_AUTH_METHOD_KEY, method);
  } catch {
    // Storage can be unavailable (Safari private mode, storage disabled, quota).
    // Losing the hint costs a line of copy, not a sign-in.
  }
}

/**
 * The method last used in this browser, or `null` when there isn't one to show.
 *
 * Anything outside `AUTH_METHODS` reads as absent rather than being rendered:
 * the value is only ever displayed, and a build that has dropped a method should
 * say nothing rather than name one it no longer has.
 */
export function readLastAuthMethod(): AuthMethod | null {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(LAST_AUTH_METHOD_KEY);
  } catch {
    return null;
  }
  return AUTH_METHODS.includes(stored as AuthMethod)
    ? (stored as AuthMethod)
    : null;
}
