import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { AUTH_SESSION_EXPIRED_EVENT } from "@/lib/api/client";

// `vi.hoisted` because `vi.mock` is lifted above every other statement in the file,
// so a plain `const` declared here would not exist yet when the factory runs.
const {
  authAPI,
  refreshAccessToken,
  clearAccessToken,
  hardNavigate,
  rememberPostAuthRedirect,
} = vi.hoisted(() => ({
  authAPI: {
    getCurrentUser: vi.fn(),
    requestEmailLink: vi.fn(),
    verifyEmailLink: vi.fn(),
    verifyEmailCode: vi.fn(),
    signInWithGoogle: vi.fn(),
    completeProfile: vi.fn(),
    signOut: vi.fn(),
    isAuthenticated: vi.fn(),
  },
  refreshAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
  hardNavigate: vi.fn(),
  rememberPostAuthRedirect: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ authAPI }));
// Real storage would work through Node's shadowed `localStorage` and warn; what
// matters here is only whether sign-out asks for the destination to be cleared.
vi.mock("@/lib/auth-redirect", () => ({ rememberPostAuthRedirect }));
// Signing out leaves for the landing page with a real page load, which jsdom
// can't perform and won't let a test intercept on `window.location` - hence the
// wrapper module (see `lib/navigation.ts`), mocked here.
vi.mock("@/lib/navigation", () => ({ hardNavigate }));
// Only the two token helpers are stubbed; `AUTH_SESSION_EXPIRED_EVENT` has to stay
// real, since the point of one test is that the provider listens for the same event
// name the client dispatches.
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  refreshAccessToken,
  clearAccessToken,
}));

const USER = {
  uuid: "u1",
  name: "Aleksei",
  username: "aleks",
  email: "a@example.com",
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuthProvider bootstrap", () => {
  it("re-derives the session from the refresh cookie on mount", async () => {
    refreshAccessToken.mockResolvedValue("token");
    authAPI.getCurrentUser.mockResolvedValue(USER);

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toEqual(USER);
    expect(result.current.isAuthenticated).toBe(true);
  });

  // The normal case for a visitor who is simply not signed in, which is why the
  // provider deliberately doesn't log it.
  it("settles as signed-out when there is no usable refresh cookie", async () => {
    refreshAccessToken.mockRejectedValue(new Error("401"));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(clearAccessToken).toHaveBeenCalled();
  });
});

describe("AuthProvider session expiry", () => {
  it("drops the user when the client reports the session expired", async () => {
    refreshAccessToken.mockResolvedValue("token");
    authAPI.getCurrentUser.mockResolvedValue(USER);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => {
      window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
    });

    expect(result.current.user).toBeNull();
  });

  it("stops listening once unmounted", async () => {
    refreshAccessToken.mockResolvedValue("token");
    authAPI.getCurrentUser.mockResolvedValue(USER);

    const { result, unmount } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    const remove = vi.spyOn(window, "removeEventListener");
    unmount();

    expect(remove).toHaveBeenCalledWith(
      AUTH_SESSION_EXPIRED_EVENT,
      expect.any(Function),
    );
    remove.mockRestore();
  });
});

describe("AuthProvider outcomes", () => {
  it("signs the user in when verification returns an authenticated outcome", async () => {
    refreshAccessToken.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    authAPI.verifyEmailLink.mockResolvedValue({ status: "authenticated" });
    authAPI.getCurrentUser.mockResolvedValue(USER);

    let signedIn: boolean | undefined;
    await act(async () => {
      signedIn = await result.current.verifyEmailLink("tok");
    });

    expect(signedIn).toBe(true);
    expect(result.current.user).toEqual(USER);
    expect(result.current.onboarding).toBeNull();
  });

  // The code rides the same request row as the link and lands in the same funnel,
  // so it has to produce a session the same way - not a second, parallel notion of
  // being signed in.
  it("signs the user in when a code from the email is accepted", async () => {
    refreshAccessToken.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    authAPI.verifyEmailCode.mockResolvedValue({ status: "authenticated" });
    authAPI.getCurrentUser.mockResolvedValue(USER);

    let signedIn: boolean | undefined;
    await act(async () => {
      signedIn = await result.current.verifyEmailCode("req-1", "481052");
    });

    expect(authAPI.verifyEmailCode).toHaveBeenCalledWith("req-1", "481052");
    expect(signedIn).toBe(true);
    expect(result.current.user).toEqual(USER);
  });

  it("stashes an onboarding session instead of signing in", async () => {
    refreshAccessToken.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    authAPI.signInWithGoogle.mockResolvedValue({
      status: "onboarding",
      onboarding_token: "onb",
      email: "new@example.com",
      name: "New Diver",
    });

    let signedIn: boolean | undefined;
    await act(async () => {
      signedIn = await result.current.signInWithGoogle("credential");
    });

    expect(signedIn).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.onboarding).toMatchObject({
      onboardingToken: "onb",
      email: "new@example.com",
    });
  });

  it("refuses to complete a profile with no onboarding session in progress", async () => {
    refreshAccessToken.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      result.current.completeProfile("Name", "username"),
    ).rejects.toThrow("No onboarding session");
    expect(authAPI.completeProfile).not.toHaveBeenCalled();
  });

  // The reload is the whole danger here. `POST /auth/logout` is the only thing
  // that blacklists the token pair and clears the refresh cookie, so after a
  // failed one the cookie is still live and a page load would hand it to
  // `initAuth`, which re-derives the session and lets `/` bounce the diver to
  // `/dashboard` - signed in, one click after asking to leave.
  it("changes nothing, and stays put, when the server didn't confirm", async () => {
    refreshAccessToken.mockResolvedValue("token");
    authAPI.getCurrentUser.mockResolvedValue(USER);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    authAPI.signOut.mockRejectedValue(new Error("500"));
    await expect(act(() => result.current.signOut())).rejects.toThrow("500");

    expect(hardNavigate).not.toHaveBeenCalled();
    // Still signed in, deliberately: the session on the server is still open, and
    // the interceptor would rebuild the access token from that cookie on the next
    // 401. Showing "signed out" over a working session is the dangerous lie.
    expect(result.current.user).toEqual(USER);
    expect(result.current.isAuthenticated).toBe(true);
  });

  // Not `/signin`: the diver asked to leave. Getting there by reloading the
  // document is the point - clearing the user re-runs `useAuthGuard` on the
  // page being signed out of, and a client-side navigation would lose to the
  // guard's own `/signin?next=<that page>` redirect.
  it("leaves for the landing page with a full page load", async () => {
    refreshAccessToken.mockResolvedValue("token");
    authAPI.getCurrentUser.mockResolvedValue(USER);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    authAPI.signOut.mockResolvedValue(undefined);
    await act(() => result.current.signOut());

    expect(result.current.user).toBeNull();
    expect(hardNavigate).toHaveBeenCalledWith("/");
    // A destination left over from an unclicked magic link would otherwise sit
    // in `localStorage` for a day, readable after the diver has gone.
    expect(rememberPostAuthRedirect).toHaveBeenCalledWith(undefined);
  });
});

describe("AuthProvider identity", () => {
  // The provider wraps the whole app, so a fresh context value on every render
  // re-renders every consumer - and its methods are dependencies of downstream
  // effects, which then re-run rather than merely re-rendering.
  it("keeps its methods stable across renders", async () => {
    refreshAccessToken.mockResolvedValue("token");
    authAPI.getCurrentUser.mockResolvedValue(USER);

    const { result, rerender } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    const before = result.current;
    rerender();

    expect(result.current).toBe(before);
    expect(result.current.signOut).toBe(before.signOut);
    expect(result.current.refreshUser).toBe(before.refreshUser);
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within an AuthProvider",
    );
  });
});
