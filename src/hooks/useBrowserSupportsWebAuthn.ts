"use client";

import { useSyncExternalStore } from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";

// A subscription that never fires: nothing turns WebAuthn on mid-session.
const neverChanges = () => () => {};

/**
 * Whether this browser has WebAuthn at all - the only switch passkeys have.
 *
 * `false` in exactly the deployments where the feature cannot work, a plain-HTTP
 * LAN instance included, which is why nothing passkey-shaped is gated on a
 * server-side flag: capability detection *is* the configuration.
 *
 * Read through `useSyncExternalStore` rather than an effect that calls
 * `setState`: this is a value that genuinely differs between the server render
 * (no `window`) and the client, not one that changes over time. So it is `false`
 * during the server render - anything gated on it is absent from the server's
 * markup by construction, and hydration matches - and the real answer from the
 * first client render onwards.
 */
export function useBrowserSupportsWebAuthn(): boolean {
  return useSyncExternalStore(
    neverChanges,
    browserSupportsWebAuthn,
    () => false,
  );
}
