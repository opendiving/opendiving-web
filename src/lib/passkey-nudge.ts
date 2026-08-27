// Whether the dashboard has already offered this browser a passkey and been told
// "not now".
//
// Per-browser, in `localStorage`, and deliberately not an account flag. A new
// browser is exactly where the offer is relevant again - that is where the diver
// has no passkey and is about to want one - so a server-side "dismissed" would
// suppress the nudge precisely where it earns its place, at the cost of a column,
// an endpoint and a migration for a banner.
//
// Clearing site data brings the offer back, and so does the settings passkeys
// card - `restorePasskeyNudge` below is the un-dismiss this module went without
// for its first few releases. That it had none was the harshest sentence in the
// privacy page's §10.3: a stored preference nobody could even change, let alone
// stop. It is owed on plain UX grounds too, independent of any statute.
//
// With the device-memory switch on there is never a stored dismissal, so the
// affordance simply has nothing to offer - consistent, not a special case.

const PASSKEY_NUDGE_DISMISSED_KEY = "opendiving:passkey-nudge-dismissed";

/**
 * Whether this browser has dismissed the enrollment nudge.
 *
 * `false` wherever storage is unavailable (Safari private mode, storage
 * disabled) rather than throwing - showing the card again is the harmless side
 * of that guess, and the diver can dismiss it again.
 */
export function isPasskeyNudgeDismissed(): boolean {
  try {
    return window.localStorage.getItem(PASSKEY_NUDGE_DISMISSED_KEY) !== null;
  } catch {
    return false;
  }
}

/** Records "not now", for as long as this browser keeps its storage. */
export function dismissPasskeyNudge(): void {
  try {
    window.localStorage.setItem(PASSKEY_NUDGE_DISMISSED_KEY, "1");
  } catch {
    // Nothing to do about it and nothing to say: the card closes either way,
    // and the worst case is that it comes back on the next dashboard visit.
  }
}

/**
 * Forgets the dismissal, so the dashboard offers a passkey again.
 *
 * Removes the entry rather than storing a "show me" value: absence is already
 * what an undismissed browser looks like, and a second stored state would be a
 * value that means the same as no value.
 */
export function restorePasskeyNudge(): void {
  try {
    window.localStorage.removeItem(PASSKEY_NUDGE_DISMISSED_KEY);
  } catch {
    // As above - and a browser that refuses storage was never holding a
    // dismissal for this to remove.
  }
}
