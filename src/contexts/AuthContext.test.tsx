import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { AUTH_SESSION_EXPIRED_EVENT } from "@/lib/api/client";

// `vi.hoisted` because `vi.mock` is lifted above every other statement in the file,
// so a plain `const` declared here would not exist yet when the factory runs.
const { authAPI, refreshAccessToken, clearAccessToken } = vi.hoisted(() => ({
  authAPI: {
    getCurrentUser: vi.fn(),
    requestEmailLink: vi.fn(),
    verifyEmailLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    completeProfile: vi.fn(),
    signOut: vi.fn(),
    isAuthenticated: vi.fn(),
  },
  refreshAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ authAPI }));
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

  it("clears the user even when signing out fails server-side", async () => {
    refreshAccessToken.mockResolvedValue("token");
    authAPI.getCurrentUser.mockResolvedValue(USER);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    authAPI.signOut.mockRejectedValue(new Error("500"));
    await act(() => result.current.signOut());

    // Leaving the diver looking signed in because the *server* failed to hear about
    // it is the wrong way round: the local session is gone either way.
    expect(result.current.user).toBeNull();
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
