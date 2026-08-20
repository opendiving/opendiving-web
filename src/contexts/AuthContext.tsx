"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import {
  authAPI,
  AuthOutcome,
  EmailLinkRequestResult,
  User,
} from "@/lib/api/auth";
import { passkeysAPI } from "@/lib/api/passkeys";
import {
  AUTH_SESSION_EXPIRED_EVENT,
  clearAccessToken,
  refreshAccessToken,
} from "@/lib/api/client";
import { rememberPostAuthRedirect } from "@/lib/auth-redirect";
import { rememberAuthMethod } from "@/lib/last-auth-method";
import { hardNavigate } from "@/lib/navigation";

// Carried from `/auth/verify` or the Google button to the profile-completion page
// when no account exists yet for a verified identity - see `OnboardingRequired` on
// the backend. Deliberately in-memory only (React state), never persisted: it's a
// short-lived hop between two pages within the same SPA session, not a durable
// session of its own.
export interface OnboardingSession {
  onboardingToken: string;
  email: string;
  name?: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  onboarding: OnboardingSession | null;
  // Step 1 of the email flow - always resolves with the same generic message,
  // regardless of whether `email` belongs to an existing account. The `request_id`
  // it resolves with is what `verifyEmailCode` below needs.
  requestEmailLink: (email: string) => Promise<EmailLinkRequestResult>;
  // Step 2 of the email flow - returns `true` if the caller was signed in, `false`
  // if onboarding started instead (see `onboarding` above).
  verifyEmailLink: (token: string) => Promise<boolean>;
  // Step 2 the other way round: the code printed in the same email, verified in the
  // tab that requested it. Same two outcomes as `verifyEmailLink`, because it claims
  // the same request row - whichever of the two arrives first wins.
  verifyEmailCode: (requestId: string, code: string) => Promise<boolean>;
  signInWithGoogle: (credential: string) => Promise<boolean>;
  // The second half of a passkey ceremony: hand back the `flow_id` the options
  // call returned along with the credential the authenticator produced. Returns
  // `true` if the caller was signed in, on the same contract as the two above.
  signInWithPasskey: (
    flowId: string,
    credential: AuthenticationResponseJSON,
  ) => Promise<boolean>;
  completeProfile: (name: string, username: string) => Promise<void>;
  clearOnboarding: () => void;
  // Ends the session and leaves for the landing page with a page load. Rejects,
  // and changes nothing, when the server didn't confirm - see the implementation
  // for why a failed logout must not clear anything locally.
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [onboarding, setOnboarding] = useState<OnboardingSession | null>(null);

  // The access token lives in memory only (see lib/api/client.ts), so it's
  // never persisted across a page load - re-derive it here from the
  // httpOnly refresh cookie before fetching the current user. A failure
  // here (e.g. no cookie, or an expired/invalid one) just means the visitor
  // isn't signed in, which is the normal case and not worth logging.
  useEffect(() => {
    const initAuth = async () => {
      try {
        await refreshAccessToken();
        const userData = await authAPI.getCurrentUser();
        setUser(userData);
      } catch {
        clearAccessToken();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  // Clear the (now stale) user when a token refresh fails elsewhere in the
  // app (see client.ts). Existing per-page "redirect if unauthenticated"
  // guards then handle navigating to the landing page via the Next.js router.
  useEffect(() => {
    const handleSessionExpired = () => setUser(null);
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () =>
      window.removeEventListener(
        AUTH_SESSION_EXPIRED_EVENT,
        handleSessionExpired,
      );
  }, []);

  // Applies an `AuthOutcome` returned by any of the five entry points (email link,
  // email code, Google, passkey, profile completion): either fetches and stores the
  // now-signed-in user, or stashes the onboarding session for the profile
  // completion page to pick up. Returns whether the caller was signed in.
  const applyOutcome = useCallback(
    async (outcome: AuthOutcome): Promise<boolean> => {
      if (outcome.status === "authenticated") {
        const userData = await authAPI.getCurrentUser();
        setUser(userData);
        setOnboarding(null);
        return true;
      }

      setOnboarding({
        onboardingToken: outcome.onboarding_token!,
        email: outcome.email!,
        name: outcome.name,
        avatar: outcome.avatar,
      });
      return false;
    },
    [],
  );

  // Note: `isLoading` intentionally isn't touched by any of the methods below.
  // It reflects only the initial auth bootstrap check above (`initAuth`),
  // which pages use to decide whether to render a full-page spinner instead
  // of their content. Each form already tracks its own in-flight state via
  // react-hook-form's `isSubmitting`, so this isn't needed for button loading
  // UI either.
  const requestEmailLink = useCallback(
    (email: string) => authAPI.requestEmailLink(email),
    [],
  );

  // Each of the four entry points below records which one it was, for the hint
  // `AuthForm` shows a returning visitor (see `lib/last-auth-method.ts`). Written
  // where the identity was proved rather than inside `applyOutcome`, which is the
  // one place that cannot tell the methods apart - and written for an
  // onboarding outcome too, since that is a sign-in a moment later by the same
  // means. `completeProfile` deliberately records nothing: it finishes whichever
  // method got that far and is not a method of its own.
  const verifyEmailLink = useCallback(
    async (token: string) => {
      const outcome = await authAPI.verifyEmailLink(token);
      rememberAuthMethod("email");
      return applyOutcome(outcome);
    },
    [applyOutcome],
  );

  const verifyEmailCode = useCallback(
    async (requestId: string, code: string) => {
      const outcome = await authAPI.verifyEmailCode(requestId, code);
      rememberAuthMethod("email");
      return applyOutcome(outcome);
    },
    [applyOutcome],
  );

  const signInWithGoogle = useCallback(
    async (credential: string) => {
      const outcome = await authAPI.signInWithGoogle(credential);
      rememberAuthMethod("google");
      return applyOutcome(outcome);
    },
    [applyOutcome],
  );

  // A passkey can only ever sign in: credentials are born inside an already
  // authenticated session, so the account always exists by the time one is
  // asserted and this path settles on `authenticated` every time in practice.
  // It still goes through `applyOutcome` rather than assuming that - the funnel
  // behind it is shared with the email and Google entry points, and an outcome
  // handled there is one this doesn't have to learn about.
  const signInWithPasskey = useCallback(
    async (flowId: string, credential: AuthenticationResponseJSON) => {
      const outcome = await passkeysAPI.verifySignIn(flowId, credential);
      rememberAuthMethod("passkey");
      return applyOutcome(outcome);
    },
    [applyOutcome],
  );

  const completeProfile = useCallback(
    async (name: string, username: string) => {
      if (!onboarding) {
        throw new Error("No onboarding session in progress.");
      }
      const outcome = await authAPI.completeProfile(
        onboarding.onboardingToken,
        name,
        username,
      );
      await applyOutcome(outcome);
    },
    [onboarding, applyOutcome],
  );

  const clearOnboarding = useCallback(() => setOnboarding(null), []);

  // Signing out always lands on the landing page, and gets there with a full
  // document navigation rather than `router.replace("/")`.
  //
  // Both halves of that are deliberate. Dropping the user re-runs `useAuthGuard`
  // on whatever protected page the diver signed out from, and that guard sends
  // them to `/signin?next=<that page>` - a client-side navigation started here
  // loses the race against it, so the diver ends up staring at a sign-in form
  // asking them back into the page they just left. A page load can't be
  // cancelled by the `history.replaceState` behind `router.replace`, so the
  // destination is settled here and not by whichever effect runs last - and the
  // entry being left behind survives intact, since the document is gone before
  // the guard's `replace` can land on it.
  //
  // Reloading is also the honest thing to do: everything the session left in
  // memory - the access token, fetched dives, blob URLs for private images -
  // goes with the document instead of lingering in a signed-out tab.
  //
  // All of which only holds if the *server* actually ended the session, so a
  // failed `POST /auth/logout` takes none of it. `logout` is the only thing that
  // blacklists the token pair and deletes the refresh cookie, so after a failed
  // one the cookie is still live - and a reload would hand it straight to
  // `initAuth`, which re-derives a session, sets a user, and lets `/` bounce the
  // diver to `/dashboard`. Signed in, on their dashboard, one click after asking
  // to leave.
  //
  // Nor is the user cleared in that case. It reads as the cautious choice, but
  // it's the dangerous one: the access token is gone from memory, yet the
  // interceptor rebuilds it from the surviving cookie on the next 401, so
  // "signed out" would be a display state over a working session - exactly the
  // lie that matters on a shared machine. Staying visibly signed in and throwing
  // lets the caller say so and lets the diver try again.
  const signOut = useCallback(async () => {
    try {
      await authAPI.signOut();
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }

    setUser(null);
    // Same reasoning as the reload, for the one piece of the session that isn't
    // in memory. A destination only survives to here if a link was requested and
    // never clicked (signing in with Google instead, say), and now that it's in
    // `localStorage` it would otherwise outlive both the sign-out and the
    // browser - leaving a `/dives/<uuid>` legible on a shared machine for a day.
    rememberPostAuthRedirect(undefined);
    // The last-used method is deliberately *not* cleared here. It names a button,
    // not a person or a destination, and surviving the sign-out is the whole
    // point: the next visitor to this browser is nearly always the same diver.
    hardNavigate("/");
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      if (authAPI.isAuthenticated()) {
        const userData = await authAPI.getCurrentUser();
        setUser(userData);
      }
    } catch (error) {
      console.error("Refresh user error:", error);
      setUser(null);
    }
  }, []);

  // Memoized because this object is the context value: rebuilding it (and all nine
  // methods) on every render of the provider makes every `useAuth()` consumer
  // re-render too, which is ~15 pages plus the header. `user` is what actually
  // changes; the methods are stable.
  //
  // It matters most for the methods rather than the value itself - `signOut` and
  // `refreshUser` are dependencies of effects and `useCallback`s downstream, so a
  // fresh identity each render re-runs those effects rather than merely re-rendering.
  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      onboarding,
      requestEmailLink,
      verifyEmailLink,
      verifyEmailCode,
      signInWithGoogle,
      signInWithPasskey,
      completeProfile,
      clearOnboarding,
      signOut,
      refreshUser,
    }),
    [
      user,
      isLoading,
      onboarding,
      requestEmailLink,
      verifyEmailLink,
      verifyEmailCode,
      signInWithGoogle,
      signInWithPasskey,
      completeProfile,
      clearOnboarding,
      signOut,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
