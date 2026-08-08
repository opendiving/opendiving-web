"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { authAPI, AuthOutcome, User } from "@/lib/api/auth";
import {
  AUTH_SESSION_EXPIRED_EVENT,
  clearAccessToken,
  refreshAccessToken,
} from "@/lib/api/client";

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
  // regardless of whether `email` belongs to an existing account.
  requestEmailLink: (email: string) => Promise<{ message: string }>;
  // Step 2 of the email flow - returns `true` if the caller was signed in, `false`
  // if onboarding started instead (see `onboarding` above).
  verifyEmailLink: (token: string) => Promise<boolean>;
  signInWithGoogle: (credential: string) => Promise<boolean>;
  completeProfile: (name: string, username: string) => Promise<void>;
  clearOnboarding: () => void;
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

  // Applies an `AuthOutcome` returned by any of the three entry points
  // (email verify, Google, profile completion): either fetches and stores the
  // now-signed-in user, or stashes the onboarding session for the profile
  // completion page to pick up. Returns whether the caller was signed in.
  const applyOutcome = async (outcome: AuthOutcome): Promise<boolean> => {
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
  };

  // Note: `isLoading` intentionally isn't touched by any of the methods below.
  // It reflects only the initial auth bootstrap check above (`initAuth`),
  // which pages use to decide whether to render a full-page spinner instead
  // of their content. Each form already tracks its own in-flight state via
  // react-hook-form's `isSubmitting`, so this isn't needed for button loading
  // UI either.
  const requestEmailLink = (email: string) => authAPI.requestEmailLink(email);

  const verifyEmailLink = async (token: string) => {
    const outcome = await authAPI.verifyEmailLink(token);
    return applyOutcome(outcome);
  };

  const signInWithGoogle = async (credential: string) => {
    const outcome = await authAPI.signInWithGoogle(credential);
    return applyOutcome(outcome);
  };

  const completeProfile = async (name: string, username: string) => {
    if (!onboarding) {
      throw new Error("No onboarding session in progress.");
    }
    const outcome = await authAPI.completeProfile(
      onboarding.onboardingToken,
      name,
      username,
    );
    await applyOutcome(outcome);
  };

  const clearOnboarding = () => setOnboarding(null);

  const signOut = async () => {
    try {
      await authAPI.signOut();
    } catch (error) {
      console.error("Sign out error:", error);
    } finally {
      setUser(null);
    }
  };

  const refreshUser = async () => {
    try {
      if (authAPI.isAuthenticated()) {
        const userData = await authAPI.getCurrentUser();
        setUser(userData);
      }
    } catch (error) {
      console.error("Refresh user error:", error);
      setUser(null);
    }
  };

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    onboarding,
    requestEmailLink,
    verifyEmailLink,
    signInWithGoogle,
    completeProfile,
    clearOnboarding,
    signOut,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
