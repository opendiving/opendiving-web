// Whether the dashboard has already offered this browser a passkey and been told
// "not now".
//
// Per-browser, in `localStorage`, and deliberately not an account flag. A new
// browser is exactly where the offer is relevant again - that is where the diver
// has no passkey and is about to want one - so a server-side "dismissed" would
// suppress the nudge precisely where it earns its place, at the cost of a column,
// an endpoint and a migration for a banner.
//
// The trade is that clearing site data brings the offer back. That is the right
// way round: the failure mode is one extra card on one dashboard visit, against
// never being offered a passkey on the laptop you just bought.

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
