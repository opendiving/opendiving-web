"use client";

import { useCallback, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

import { useBrowserSupportsWebAuthn } from "@/hooks/useBrowserSupportsWebAuthn";
import { getApiErrorMessage } from "@/lib/api/error";
import { passkeysAPI, type Passkey } from "@/lib/api/passkeys";
import { isCeremonyDismissed } from "@/lib/passkey-ceremony";
import { suggestPasskeyName } from "@/lib/passkey-name";

interface UsePasskeyRegistrationOptions {
  /**
   * Runs with the stored passkey once a ceremony completes - to fold it into a
   * list, or to make the card that offered it go away. May be async; a failure
   * inside it is logged rather than reported, since the passkey exists by then.
   */
  onRegistered: (passkey: Passkey) => void | Promise<void>;
  /** Shown to the diver when a ceremony fails for a reason they didn't choose. */
  onError: (message: string) => void;
}

interface PasskeyRegistration {
  /** Whether this browser can create a passkey at all - see `useBrowserSupportsWebAuthn`. */
  supported: boolean;
  /** True from the click until the passkey is stored and `onRegistered` has run. */
  isRegistering: boolean;
  /**
   * Runs the whole ceremony: options, the browser's create prompt, verify.
   *
   * Call it straight from a click and nowhere else. Safari requires a user
   * gesture for `navigator.credentials.create()`, which is the reason nothing in
   * this app ever fires enrollment on its own - the nudge card and the settings
   * card both put a button in front of it.
   */
  register: () => Promise<void>;
}

const ADD_FAILED = "Couldn't add that passkey. Please try again.";

/**
 * Adding a passkey to the signed-in account, in the one shape both places that
 * offer it need: the settings card and the dashboard's enrollment nudge.
 *
 * Registration is the mirror of `usePasskeySignIn`'s explicit half - options,
 * ceremony, verify - with two differences that follow from it happening inside a
 * session. There is no `flow_id`, because the bearer token already names whose
 * challenge it is; and the client picks the label (`lib/passkey-name.ts`), since
 * only the browser knows what it is running on.
 */
export function usePasskeyRegistration({
  onRegistered,
  onError,
}: UsePasskeyRegistrationOptions): PasskeyRegistration {
  const supported = useBrowserSupportsWebAuthn();
  const [isRegistering, setIsRegistering] = useState(false);

  const register = useCallback(async () => {
    setIsRegistering(true);

    let created: Passkey | null = null;
    try {
      const options = await passkeysAPI.requestRegistrationOptions();
      const credential = await startRegistration({ optionsJSON: options });
      created = await passkeysAPI.verifyRegistration(
        credential,
        suggestPasskeyName(),
      );
    } catch (error) {
      // A dismissed sheet is a diver who changed their mind, not a failure.
      // Everything else gets the API's own wording where it has one - the 409
      // for an account already at its passkey limit is the case that matters,
      // and "please try again" is precisely wrong advice for it.
      if (!isCeremonyDismissed(error)) {
        onError(getApiErrorMessage(error, ADD_FAILED));
      }
    }

    // Outside the block above on purpose. The passkey is stored by the time this
    // runs, so a caller whose list refresh throws must not turn a completed
    // registration into "couldn't add that passkey" - the diver would try again
    // and meet the duplicate-credential 409.
    try {
      if (created) await onRegistered(created);
    } catch (error) {
      console.error("Added a passkey, but refreshing after it failed:", error);
    } finally {
      setIsRegistering(false);
    }
  }, [onRegistered, onError]);

  return { supported, isRegistering, register };
}
