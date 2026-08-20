"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  WebAuthnAbortService,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/browser";

import { useAuth } from "@/contexts/AuthContext";
import { useBrowserSupportsWebAuthn } from "@/hooks/useBrowserSupportsWebAuthn";
import { getApiErrorMessage } from "@/lib/api/error";
import { passkeysAPI } from "@/lib/api/passkeys";
import {
  DEFAULT_POST_AUTH_REDIRECT,
  sanitizeRedirectPath,
} from "@/lib/auth-redirect";
import { isCeremonyDismissed } from "@/lib/passkey-ceremony";

interface UsePasskeySignInOptions {
  /**
   * Arms the browser's own autofill ("conditional UI") ceremony while true. Pass
   * `false` whenever the `<input autocomplete="... webauthn">` the ceremony is
   * anchored to is not on screen - the ceremony is cancelled as this goes false.
   */
  autofill: boolean;
  /**
   * Where to land after signing in, when the visitor was headed somewhere
   * specific. A prop, not storage: this ceremony never leaves the tab, exactly
   * like Google's (see `lib/auth-redirect.ts`).
   */
  redirectTo?: string | null;
  /** Shown to the visitor when an explicit ceremony fails for a real reason. */
  onError: (message: string) => void;
}

interface PasskeySignIn {
  /**
   * Whether this browser has WebAuthn at all. `false` on a plain-HTTP instance,
   * where the API is simply absent - which is why nothing here is gated on a
   * server-side flag: capability detection *is* the switch.
   *
   * `false` during the server render and true from the first client render, so
   * anything gated on it is absent from the server's markup by construction.
   */
  supported: boolean;
  /** True while an explicit ceremony started by `signIn` is in flight. */
  isSigningIn: boolean;
  /**
   * Runs the modal ceremony - the browser's own passkey sheet, including its
   * cross-device QR flow. Always mints a fresh challenge rather than reusing the
   * armed conditional one.
   */
  signIn: () => Promise<void>;
}

const SIGN_IN_FAILED = "Couldn't sign in with that passkey. Please try again.";

/**
 * Passkey sign-in, in both of the shapes a login form needs: armed quietly behind
 * the browser's autofill dropdown, and run explicitly from a button.
 *
 * Both halves are the same three steps - ask the API for a challenge, let the
 * authenticator sign it, post the credential back - and differ only in how the
 * ceremony is presented and in how loudly they fail. The conditional one is
 * speculative: nobody asked for it, so nothing it does is ever reported. The
 * explicit one was clicked, so a real failure gets a message.
 */
export function usePasskeySignIn({
  autofill,
  redirectTo,
  onError,
}: UsePasskeySignInOptions): PasskeySignIn {
  const { signInWithPasskey } = useAuth();
  const router = useRouter();
  const supported = useBrowserSupportsWebAuthn();
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Everything the ceremonies need that isn't `supported`/`autofill` is read
  // through this ref rather than through effect dependencies. Re-running the
  // arming effect *cancels a live ceremony and starts another one*, so it must
  // key on the two things that genuinely mean "arm differently" and on nothing
  // else - a caller passing an inline `onError` lambda would otherwise tear the
  // browser's autofill dropdown down on every render of the form.
  //
  // Written from an effect rather than during render, per this project's
  // `react-hooks/refs` lint rule.
  const latest = useRef({ redirectTo, onError, signInWithPasskey, router });
  useEffect(() => {
    latest.current = { redirectTo, onError, signInWithPasskey, router };
  });

  // The tail of both ceremonies: post the credential, then route the same way the
  // Google button does. Notably this does *not* call `rememberPostAuthRedirect` -
  // that `localStorage` slot belongs to the email flow, which leaves the tab and
  // comes back on `/auth/verify` with no other way to know where it was headed.
  // Writing it here would leave a destination behind that a later magic-link
  // sign-in would then honour, long after this ceremony had used its own prop.
  const completeCeremony = useCallback(
    async (flowId: string, credential: AuthenticationResponseJSON) => {
      const { redirectTo, signInWithPasskey, router } = latest.current;
      const signedIn = await signInWithPasskey(flowId, credential);
      router.push(
        signedIn
          ? (sanitizeRedirectPath(redirectTo) ?? DEFAULT_POST_AUTH_REDIRECT)
          : "/onboarding",
      );
    },
    [],
  );

  // Conditional UI: the passkey shows up in the browser's ordinary autofill
  // dropdown on the email field, and picking it signs the diver in without them
  // ever having asked for a passkey. Nothing about this is visible until it
  // works, so nothing about it is ever reported - an instance whose API has no
  // passkey routes yet simply 404s here and the form behaves exactly as before.
  useEffect(() => {
    if (!supported || !autofill) return;

    let cancelled = false;

    const arm = async (isRetry: boolean) => {
      if (!(await browserSupportsWebAuthnAutofill())) return;
      if (cancelled) return;

      let flow;
      try {
        flow = await passkeysAPI.requestSignInOptions();
      } catch {
        return;
      }
      if (cancelled) return;

      let credential;
      try {
        credential = await startAuthentication({
          optionsJSON: flow.options,
          useBrowserAutofill: true,
        });
      } catch {
        // Aborted, declined, or a browser that offered autofill and then refused
        // the ceremony. None of it was asked for, so none of it is reported.
        return;
      }
      if (cancelled) return;

      try {
        await completeCeremony(flow.flow_id, credential);
      } catch {
        // The likeliest cause is a diver who left the login page open past the
        // challenge's ten-minute life, picked a passkey, and hit a dead
        // challenge. One silent re-arm on a fresh one covers that; a second
        // failure is a real one and is left alone rather than looped on.
        if (!isRetry && !cancelled) void arm(true);
      }
    };

    void arm(false);

    return () => {
      cancelled = true;
      // The input this is anchored to is about to leave (the form swapping to
      // "check your email", or the page unmounting), so the pending ceremony
      // goes with it rather than lingering against a field that no longer exists.
      WebAuthnAbortService.cancelCeremony();
    };
  }, [supported, autofill, completeCeremony]);

  // The explicit button. Worth having even where conditional UI works: a brand-new
  // laptop has no autofill entry to offer, and the browser's cross-device (QR)
  // sheet only ever appears behind a deliberate ceremony. Starting this cancels
  // the armed conditional one - v13's abort service does that on its own - which
  // is why it always fetches its own challenge instead of reusing that one.
  const signIn = useCallback(async () => {
    setIsSigningIn(true);
    try {
      const flow = await passkeysAPI.requestSignInOptions();
      const credential = await startAuthentication({
        optionsJSON: flow.options,
      });
      await completeCeremony(flow.flow_id, credential);
    } catch (error) {
      if (!isCeremonyDismissed(error)) {
        latest.current.onError(getApiErrorMessage(error, SIGN_IN_FAILED));
      }
    } finally {
      setIsSigningIn(false);
    }
  }, [completeCeremony]);

  return { supported, isSigningIn, signIn };
}
