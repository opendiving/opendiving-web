import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { AUTH_SESSION_EXPIRED_EVENT } from "@/lib/api/client";
import {
  ENTRY_UNITS_KEY,
  readStoredEntryUnits,
  writeEntryUnits,
} from "@/lib/entry-units";
import { memoryStorage, useStorage } from "@/test/memory-storage";

// `vi.hoisted` because `vi.mock` is lifted above every other statement in the file,
// so a plain `const` declared here would not exist yet when the factory runs.
const {
  authAPI,
  passkeysAPI,
  refreshAccessToken,
  clearAccessToken,
  hardNavigate,
  rememberPostAuthRedirect,
  rememberAuthMethod,
} = vi.hoisted(() => ({
  passkeysAPI: { verifySignIn: vi.fn() },
  authAPI: {
    getCurrentUser: vi.fn(),
    requestEmailLink: vi.fn(),
    verifyEmailLink: vi.fn(),
    verifyEmailCode: vi.fn(),
    signInWithGoogle: vi.fn(),
    completeProfile: vi.fn(),
    restoreAccount: vi.fn(),
    signOut: vi.fn(),
    isAuthenticated: vi.fn(),
  },
  refreshAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
  hardNavigate: vi.fn(),
  rememberPostAuthRedirect: vi.fn(),
  rememberAuthMethod: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ authAPI }));
vi.mock("@/lib/api/passkeys", () => ({ passkeysAPI }));
// Real storage would work through Node's shadowed `localStorage` and warn; what
// matters here is only whether sign-out asks for the destination to be cleared.
vi.mock("@/lib/auth-redirect", () => ({ rememberPostAuthRedirect }));
// Same reasoning for the hint the sign-in form shows a returning visitor: the
// storage itself is unit-tested in `lib/last-auth-method.test.ts`, so what the
// provider owes is only that each entry point names itself.
vi.mock("@/lib/last-auth-method", () => ({ rememberAuthMethod }));
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

    let status: string | undefined;
    await act(async () => {
      status = (await result.current.verifyEmailLink("tok")).status;
    });

    expect(status).toBe("authenticated");
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

    let status: string | undefined;
    await act(async () => {
      status = (await result.current.verifyEmailCode("req-1", "481052")).status;
    });

    expect(authAPI.verifyEmailCode).toHaveBeenCalledWith("req-1", "481052");
    expect(status).toBe("authenticated");
    expect(result.current.user).toEqual(USER);
  });

  it("stashes an onboarding session instead of signing in", async () => {
    refreshAccessToken.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    authAPI.signInWithGoogle.mockResolvedValue({
      status: "onboarding_required",
      onboarding_token: "onb",
      email: "new@example.com",
      name: "New Diver",
    });

    let status: string | undefined;
    await act(async () => {
      status = (await result.current.signInWithGoogle("credential")).status;
    });

    expect(status).toBe("onboarding_required");
    expect(result.current.user).toBeNull();
    expect(result.current.onboarding).toMatchObject({
      onboardingToken: "onb",
      email: "new@example.com",
    });
    expect(result.current.restore).toBeNull();
  });

  // The third outcome, and the one that used to be mistaken for the second: it
  // carries no `onboarding_token`, so the old two-branch `applyOutcome` stashed an
  // onboarding session with an undefined token and carried it to `/auth/complete`.
  // Asserting `onboarding` stays null is what pins that.
  it("stashes a restore session for an account pending deletion", async () => {
    refreshAccessToken.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    authAPI.signInWithGoogle.mockResolvedValue({
      status: "deletion_pending",
      restore_token: "res",
      email: "gone@example.com",
      purge_after: "2026-09-04T12:00:00Z",
    });

    let status: string | undefined;
    await act(async () => {
      status = (await result.current.signInWithGoogle("credential")).status;
    });

    expect(status).toBe("deletion_pending");
    expect(result.current.user).toBeNull();
    expect(result.current.onboarding).toBeNull();
    expect(result.current.restore).toEqual({
      restoreToken: "res",
      email: "gone@example.com",
      purgeAfter: "2026-09-04T12:00:00Z",
    });
    expect(authAPI.getCurrentUser).not.toHaveBeenCalled();
  });

  // A row the API flagged with no clock to count from - the offer stands, it just
  // cannot name a day, and the screen has to be handed a null rather than an
  // "undefined" that renders as one.
  it("carries a null purge date rather than dropping the offer", async () => {
    refreshAccessToken.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    passkeysAPI.verifySignIn.mockResolvedValue({
      status: "deletion_pending",
      restore_token: "res",
      email: "gone@example.com",
    });

    await act(async () => {
      await result.current.signInWithPasskey("flow-1", { id: "c" } as never);
    });

    expect(result.current.restore).toEqual({
      restoreToken: "res",
      email: "gone@example.com",
      purgeAfter: null,
    });
  });

  // Restoring is a sign-in: it clears the offer it was reached from, so nothing
  // left over can send a signed-in diver back to `/restore`.
  it("signs the restored account in and clears the offer", async () => {
    refreshAccessToken.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    authAPI.verifyEmailCode.mockResolvedValue({
      status: "deletion_pending",
      restore_token: "res",
      email: "gone@example.com",
      purge_after: "2026-09-04T12:00:00Z",
    });
    await act(async () => {
      await result.current.verifyEmailCode("req-1", "481052");
    });

    authAPI.restoreAccount.mockResolvedValue({ status: "authenticated" });
    authAPI.getCurrentUser.mockResolvedValue(USER);
    await act(async () => {
      await result.current.restoreAccount("res");
    });

    expect(authAPI.restoreAccount).toHaveBeenCalledWith("res");
    expect(result.current.user).toEqual(USER);
    expect(result.current.restore).toBeNull();
  });

  // The account is still deleted when a restore fails, and the offer has to survive
  // it: the token may simply have raced a second tab, and the screen is where the
  // API's own explanation gets shown.
  it("keeps the offer when the restore is refused", async () => {
    refreshAccessToken.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    authAPI.verifyEmailCode.mockResolvedValue({
      status: "deletion_pending",
      restore_token: "res",
      email: "gone@example.com",
      purge_after: "2026-09-04T12:00:00Z",
    });
    await act(async () => {
      await result.current.verifyEmailCode("req-1", "481052");
    });

    authAPI.restoreAccount.mockRejectedValue(new Error("401"));
    await expect(result.current.restoreAccount("res")).rejects.toThrow();

    expect(result.current.user).toBeNull();
    expect(result.current.restore).toMatchObject({ restoreToken: "res" });
  });

  // A passkey resolves straight to an existing account, so this is the one entry
  // point that has no realistic onboarding branch - it still goes through the
  // same `applyOutcome` as the other two rather than assuming a session.
  it("signs the user in from a verified passkey assertion", async () => {
    refreshAccessToken.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    passkeysAPI.verifySignIn.mockResolvedValue({ status: "authenticated" });
    authAPI.getCurrentUser.mockResolvedValue(USER);

    let status: string | undefined;
    await act(async () => {
      status = (
        await result.current.signInWithPasskey("flow-1", {
          id: "credential-id",
        } as never)
      ).status;
    });

    expect(passkeysAPI.verifySignIn).toHaveBeenCalledWith("flow-1", {
      id: "credential-id",
    });
    expect(status).toBe("authenticated");
    expect(result.current.user).toEqual(USER);
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

// The third key sign-out has to decide about, and it goes with the destination
// rather than with the sign-in hint. Deliberately *not* mocked away like those
// two: what the module does is the thing being pinned here, so this asserts on
// the real storage rather than on a call having been made.
describe("AuthProvider sign-out and the entry units", () => {
  beforeEach(() => {
    useStorage(memoryStorage());
    writeEntryUnits({ pressure: "imperial" });
  });

  async function signedIn() {
    refreshAccessToken.mockResolvedValue("token");
    authAPI.getCurrentUser.mockResolvedValue(USER);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    return result;
  }

  // Unlike the two keys either side of it, this one is cleared for what it does
  // rather than for what it names: an inherited override changes what a dive-form
  // box *parses*, so the next diver at a shared browser could type 200 into a
  // psi-labelled field and commit 13.79 bar - inside the API's range CHECK and
  // indistinguishable from real data afterwards.
  it("forgets them on the way out", async () => {
    const result = await signedIn();

    authAPI.signOut.mockResolvedValue(undefined);
    await act(() => result.current.signOut());

    expect(window.localStorage.getItem(ENTRY_UNITS_KEY)).toBeNull();
    expect(readStoredEntryUnits()).toBeNull();
  });

  // The standing invariant in this file: a sign-out the server did not confirm
  // clears nothing locally. The refresh cookie is still live, so the diver is
  // still signed in - and must not find their entry units wiped for it.
  it("keeps them when the server didn't confirm", async () => {
    const result = await signedIn();

    authAPI.signOut.mockRejectedValue(new Error("500"));
    await expect(act(() => result.current.signOut())).rejects.toThrow("500");

    expect(window.localStorage.getItem(ENTRY_UNITS_KEY)).not.toBeNull();
  });
});

describe("AuthProvider last-used method", () => {
  async function signedOutProvider() {
    refreshAccessToken.mockRejectedValue(new Error("401"));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    authAPI.getCurrentUser.mockResolvedValue(USER);
    return result;
  }

  it("records which of the three ways in was used", async () => {
    const result = await signedOutProvider();
    authAPI.verifyEmailLink.mockResolvedValue({ status: "authenticated" });
    authAPI.signInWithGoogle.mockResolvedValue({ status: "authenticated" });
    passkeysAPI.verifySignIn.mockResolvedValue({ status: "authenticated" });

    await act(async () => {
      await result.current.verifyEmailLink("tok");
    });
    await act(async () => {
      await result.current.signInWithGoogle("credential");
    });
    await act(async () => {
      await result.current.signInWithPasskey("flow-1", { id: "c" } as never);
    });

    expect(rememberAuthMethod.mock.calls.flat()).toEqual([
      "email",
      "google",
      "passkey",
    ]);
  });

  // The link and the code arrive in the same message and claim the same request
  // row, so "you signed in with your email" is true of both - a fourth method
  // here would be a distinction the diver never made.
  it("calls the code in the email the same method as the link", async () => {
    const result = await signedOutProvider();
    authAPI.verifyEmailCode.mockResolvedValue({ status: "authenticated" });

    await act(async () => {
      await result.current.verifyEmailCode("req-1", "481052");
    });

    expect(rememberAuthMethod).toHaveBeenCalledWith("email");
  });

  // Onboarding is a sign-in a moment later by the same means, so the method is
  // recorded where the identity was proved - and `completeProfile`, which
  // finishes whichever method got that far, is not a method of its own.
  it("records the method that proved the identity, not the step after it", async () => {
    const result = await signedOutProvider();
    authAPI.signInWithGoogle.mockResolvedValue({
      status: "onboarding",
      onboarding_token: "onb",
      email: "new@example.com",
    });
    authAPI.completeProfile.mockResolvedValue({ status: "authenticated" });

    await act(async () => {
      await result.current.signInWithGoogle("credential");
    });
    expect(rememberAuthMethod).toHaveBeenCalledWith("google");

    rememberAuthMethod.mockClear();
    await act(async () => {
      await result.current.completeProfile("New Diver", "newdiver");
    });

    expect(rememberAuthMethod).not.toHaveBeenCalled();
  });

  // Unlike the remembered destination, which is cleared on the way out: this
  // names a button rather than a person or a page, and surviving the sign-out is
  // the whole point of it.
  it("keeps the hint through a sign-out", async () => {
    refreshAccessToken.mockResolvedValue("token");
    authAPI.getCurrentUser.mockResolvedValue(USER);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    authAPI.signOut.mockResolvedValue(undefined);
    await act(() => result.current.signOut());

    expect(rememberAuthMethod).not.toHaveBeenCalled();
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
    expect(result.current.signInWithPasskey).toBe(before.signInWithPasskey);
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within an AuthProvider",
    );
  });
});
