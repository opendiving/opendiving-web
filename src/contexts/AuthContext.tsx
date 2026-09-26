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
  GoogleAuthorizationGrant,
  User,
} from "@/lib/api/auth";
import { passkeysAPI } from "@/lib/api/passkeys";
import {
  AUTH_SESSION_EXPIRED_EVENT,
  clearAccessToken,
  refreshAccessToken,
} from "@/lib/api/client";
import { rememberPostAuthRedirect } from "@/lib/auth-redirect";
import { clearEntryUnits } from "@/lib/entry-units";
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
}

// The same hop, for the account that already exists and is waiting to be purged -
// see `DeletionPending` on the backend. Carried from whichever of the four entry
// points verified the identity to `/restore`, which is the screen that offers the
// account back and the only place `restoreAccount` is called from.
//
// In memory only, exactly like the onboarding session above, and here that has a
// consequence worth stating on the screen: the six-digit code claims its request row
// before the outcome is even resolved, so a code spent on reaching the offer is spent
// and a reload leaves nothing to come back to.
export interface RestoreSession {
  restoreToken: string;
  email: string;
  // The date the account stops being recoverable. Null for a row the API flagged with
  // no clock to count from - the offer still stands, it just cannot name a day.
  purgeAfter: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  onboarding: OnboardingSession | null;
  restore: RestoreSession | null;
  // Step 1 of the email flow - always resolves with the same generic message,
  // regardless of whether `email` belongs to an existing account. The `request_id`
  // it resolves with is what `verifyEmailCode` below needs.
  requestEmailLink: (email: string) => Promise<EmailLinkRequestResult>;
  // Step 2 of the email flow - resolves with the applied outcome, whose `status`
  // says which of the three things happened (signed in, onboarding started, or an
  // account offered back). Callers route on it: `destinationForOutcome` in
  // `lib/auth-redirect.ts` is the one place that maps a status to a page.
  verifyEmailLink: (token: string) => Promise<AuthOutcome>;
  // Step 2 the other way round: the code printed in the same email, verified in the
  // tab that requested it. Same three outcomes as `verifyEmailLink`, because it claims
  // the same request row - whichever of the two arrives first wins.
  verifyEmailCode: (requestId: string, code: string) => Promise<AuthOutcome>;
  // The tail of the Google round trip, called from `/auth/google/callback` rather
  // than from the button: this flow leaves the tab, so what reaches here is an
  // authorization code the visitor's browser carried back, not an identity.
  signInWithGoogle: (grant: GoogleAuthorizationGrant) => Promise<AuthOutcome>;
  // The second half of a passkey ceremony: hand back the `flow_id` the options
  // call returned along with the credential the authenticator produced. Resolves
  // with the outcome, on the same contract as the three above.
  signInWithPasskey: (
    flowId: string,
    credential: AuthenticationResponseJSON,
  ) => Promise<AuthOutcome>;
  completeProfile: (name: string, username: string) => Promise<void>;
  // Undoes a deletion and signs the restored account back in. Takes the token
  // rather than reading `restore` above, because the magic-link path never sees that
  // state: its precheck already labelled the button *Restore my account*, so it
  // chains verify-then-restore inside one handler, a render before the stashed
  // session exists. `/restore` passes the one it was handed.
  restoreAccount: (restoreToken: string) => Promise<void>;
  clearOnboarding: () => void;
  // Ends the session and leaves for the landing page with a page load. Rejects,
  // and changes nothing, when the server didn't confirm - see the implementation
  // for why a failed logout must not clear anything locally.
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  // Folds fields a `PATCH /user` has already stored into the cached user, with no
  // request of its own.
  //
  // `refreshUser` is the general answer and stays the right one for a settings card,
  // which changes something the whole app renders from; a sibling card mid-edit is
  // safe because `UserFieldsForm` repaints on its own stored values, not on `user`.
  // It is the wrong one for the dive form's Fields dialog: that sits on
  // `/dives/new` beside a last-dive prefill effect, and a `GET /user` per switch
  // spends a round trip re-reading a value this caller already knows.
  //
  // It still replaces the `user` object, and that is unavoidable - a new list is a
  // new object either way. What makes it safe is that the prefill effect keys on
  // `user.uuid` rather than on the object (see `dives/new/page.tsx`), so the identity
  // change re-renders consumers without re-running it. Anything else that lists
  // `user` in a dependency array has to hold to the same rule.
  mergeUser: (fields: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [onboarding, setOnboarding] = useState<OnboardingSession | null>(null);
  const [restore, setRestore] = useState<RestoreSession | null>(null);

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

  // Applies an `AuthOutcome` returned by any of the six entry points (email link,
  // email code, Google, passkey, profile completion, restore): fetches and stores the
  // now-signed-in user, or stashes the short-lived session the next screen needs -
  // onboarding for the profile-completion page, restore for `/restore`. Hands the
  // outcome back so the caller can route on its status.
  //
  // Three branches, not two, and the third is why this is not `if authenticated else
  // onboarding`: a `deletion_pending` outcome carries no `onboarding_token`, so
  // falling through to that branch stashed an onboarding session with an undefined
  // token and carried it to `/auth/complete`. Every entry point shares this function,
  // which is what makes one branch here cover all four of them.
  const applyOutcome = useCallback(
    async (outcome: AuthOutcome): Promise<AuthOutcome> => {
      if (outcome.status === "authenticated") {
        const userData = await authAPI.getCurrentUser();
        setUser(userData);
        setOnboarding(null);
        setRestore(null);
        return outcome;
      }

      if (outcome.status === "deletion_pending") {
        setRestore({
          restoreToken: outcome.restore_token!,
          email: outcome.email!,
          purgeAfter: outcome.purge_after ?? null,
        });
        setOnboarding(null);
        return outcome;
      }

      setOnboarding({
        onboardingToken: outcome.onboarding_token!,
        email: outcome.email!,
        name: outcome.name,
      });
      setRestore(null);
      return outcome;
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

  // The entry points below deliberately record nothing about which one was
  // used. Each wrote a key the sign-in form read back as a hint; that was
  // dropped on the owner's product call rather than by attrition, so re-adding
  // it is a decision to make again - see "The sign-in form does not remember
  // which method this browser used" in `DECISIONS.md`.
  const verifyEmailLink = useCallback(
    async (token: string) => {
      const outcome = await authAPI.verifyEmailLink(token);
      return applyOutcome(outcome);
    },
    [applyOutcome],
  );

  const verifyEmailCode = useCallback(
    async (requestId: string, code: string) => {
      const outcome = await authAPI.verifyEmailCode(requestId, code);
      return applyOutcome(outcome);
    },
    [applyOutcome],
  );

  const signInWithGoogle = useCallback(
    async (grant: GoogleAuthorizationGrant) => {
      const outcome = await authAPI.signInWithGoogle(grant);
      return applyOutcome(outcome);
    },
    [applyOutcome],
  );

  // A passkey can never reach onboarding: credentials are born inside an already
  // authenticated session, so the account always exists by the time one is
  // asserted. It can still be an account inside its grace period, which is the one
  // outcome besides `authenticated` this path has - and the reason it goes through
  // `applyOutcome` rather than assuming a session came back. The funnel behind it
  // is shared with the email and Google entry points, so an outcome handled there
  // is one this doesn't have to learn about.
  const signInWithPasskey = useCallback(
    async (flowId: string, credential: AuthenticationResponseJSON) => {
      const outcome = await passkeysAPI.verifySignIn(flowId, credential);
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

  // The click that makes a restore a decision rather than a side effect of signing
  // in. Everything before it was read-only - the account is still deleted when this
  // is called, and still deleted if it throws.
  const restoreAccount = useCallback(
    async (restoreToken: string) => {
      const outcome = await authAPI.restoreAccount(restoreToken);
      await applyOutcome(outcome);
    },
    [applyOutcome],
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
    // Cleared for a third reason, which is neither of the two above: the entry
    // unit override names nobody and reveals nothing, but what it changes is what
    // a dive-form box *parses*. A second diver at this browser who never touched
    // a toggle would meet a psi-labelled pressure field, type 200 meaning bar,
    // and commit 13.79 bar - inside the API's range CHECK and indistinguishable
    // from real data afterwards. The cost lands on the diver who asked to leave:
    // an explicit sign-out forgets the psi choice. A reload is not one of these,
    // since the access token is re-derived from the cookie.
    clearEntryUnits();
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

  // No-ops when nobody is signed in rather than creating a user out of a patch: the
  // only caller is a screen that only renders for a signed-in diver, and a partial
  // `User` in the context would be a session that never happened.
  const mergeUser = useCallback((fields: Partial<User>) => {
    setUser((current) => (current ? { ...current, ...fields } : current));
  }, []);

  // Memoized because this object is the context value: rebuilding it (and all ten
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
      restore,
      requestEmailLink,
      verifyEmailLink,
      verifyEmailCode,
      signInWithGoogle,
      signInWithPasskey,
      completeProfile,
      restoreAccount,
      clearOnboarding,
      signOut,
      refreshUser,
      mergeUser,
    }),
    [
      user,
      isLoading,
      onboarding,
      restore,
      requestEmailLink,
      verifyEmailLink,
      verifyEmailCode,
      signInWithGoogle,
      signInWithPasskey,
      completeProfile,
      restoreAccount,
      clearOnboarding,
      signOut,
      refreshUser,
      mergeUser,
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
