// Reading a failed WebAuthn ceremony, for the two hooks that run one.
//
// Sign-in and registration fail in the same two harmless ways - the diver closed
// the sheet, or the ceremony was stood down - and telling those apart from a real
// failure is subtle enough that both hooks reading the same function is the point
// of this module.

import { WebAuthnError } from "@simplewebauthn/browser";

/**
 * Whether an error means the diver backed out rather than anything failing.
 *
 * Two shapes, one meaning. `ERROR_CEREMONY_ABORTED` is what v13 raises when a
 * ceremony is cancelled by an abort signal - which is how the sign-in hook stands
 * its conditional ceremony down, and how v13 itself stands one down when another
 * ceremony starts. Matched on `code`, which is the documented contract; v13 also
 * copies the wrapped `DOMException`'s `name` onto the wrapper, so `"AbortError"`
 * happens to work too, but that is incidental and unwritten-down.
 *
 * `NotAllowedError` is the sheet being dismissed, and reaches us through v13's
 * deliberate passthrough - one code (`ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY`) for
 * every spec error it declines to reinterpret, so the copied `name` is what
 * distinguishes it. The spec overloads that error on purpose - dismissed, timed
 * out, and "no credential matched" are one error, so that a page cannot ask
 * whether an account has a passkey - and every reading of it is a diver who chose
 * to stop. Reporting it would scold someone for closing a dialog.
 */
export function isCeremonyDismissed(error: unknown): boolean {
  if (!(error instanceof WebAuthnError)) return false;
  return (
    error.code === "ERROR_CEREMONY_ABORTED" || error.name === "NotAllowedError"
  );
}
