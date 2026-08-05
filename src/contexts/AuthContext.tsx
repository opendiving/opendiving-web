"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { authAPI, User, LoginCredentials, SignUpData } from "@/lib/api/auth";
import {
  AUTH_SESSION_EXPIRED_EVENT,
  clearAccessToken,
  refreshAccessToken,
} from "@/lib/api/client";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (credentials: LoginCredentials) => Promise<void>;
  signUp: (userData: SignUpData) => Promise<void>;
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
  // guards then handle navigating to /signin via the Next.js router.
  useEffect(() => {
    const handleSessionExpired = () => setUser(null);
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () =>
      window.removeEventListener(
        AUTH_SESSION_EXPIRED_EVENT,
        handleSessionExpired,
      );
  }, []);

  // Note: `isLoading` intentionally isn't touched here. It reflects only the
  // initial auth bootstrap check above (`initAuth`), which pages use to
  // decide whether to render a full-page spinner instead of their content
  // (see `useRedirectIfAuthenticated`). If `signIn`/`signUp` toggled it too,
  // a failed sign in would briefly unmount `SignInForm` (its spinner takes
  // over the page) and remount a fresh instance once the request settles,
  // silently discarding the error message the form was about to show.
  // Each form already tracks its own in-flight state via react-hook-form's
  // `isSubmitting`, so this isn't needed for the button's loading UI either.
  const signIn = async (credentials: LoginCredentials) => {
    await authAPI.signIn(credentials);
    const userData = await authAPI.getCurrentUser();
    setUser(userData);
  };

  const signUp = async (userData: SignUpData) => {
    await authAPI.signUp(userData);
    // After signup, automatically sign in
    await signIn({
      username: userData.username,
      password: userData.password,
    });
  };

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
    signIn,
    signUp,
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
