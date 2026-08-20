import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePasskeySignIn } from "./usePasskeySignIn";

// `vi.hoisted` because `vi.mock` is lifted above every other statement in the
// file, so plain `const`s declared here would not exist yet when the factories
// run. The router object has to come from here too, and be one stable reference:
// a fresh object per `useRouter()` call re-runs every effect that depends on it.
const mocks = vi.hoisted(() => {
  // Stands in for the real `WebAuthnError`, which the hook narrows with
  // `instanceof` - so this has to be the same class the hook imports, which it is
  // once the module below is mocked with it.
  class WebAuthnError extends Error {
    code: string;
    constructor({
      message,
      code,
      name,
    }: {
      message: string;
      code: string;
      name?: string;
    }) {
      super(message);
      this.code = code;
      this.name = name ?? "Error";
    }
  }

  return {
    WebAuthnError,
    browserSupportsWebAuthn: vi.fn<() => boolean>(),
    browserSupportsWebAuthnAutofill: vi.fn<() => Promise<boolean>>(),
    startAuthentication: vi.fn(),
    cancelCeremony: vi.fn(),
    requestSignInOptions: vi.fn(),
    signInWithPasskey: vi.fn(),
    rememberPostAuthRedirect: vi.fn(),
    router: { push: vi.fn() },
  };
});

vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: mocks.browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill: mocks.browserSupportsWebAuthnAutofill,
  startAuthentication: mocks.startAuthentication,
  WebAuthnAbortService: { cancelCeremony: mocks.cancelCeremony },
  WebAuthnError: mocks.WebAuthnError,
}));

vi.mock("@/lib/api/passkeys", () => ({
  passkeysAPI: { requestSignInOptions: mocks.requestSignInOptions },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ signInWithPasskey: mocks.signInWithPasskey }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

// The sanitizer and the default destination stay real - one test feeds a hostile
// `redirectTo` and the point is that the real rules reject it. Only the storage
// write is a spy, so a test can assert this path never performs one.
vi.mock("@/lib/auth-redirect", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  rememberPostAuthRedirect: mocks.rememberPostAuthRedirect,
}));

const FLOW = { flow_id: "flow-1", options: { challenge: "abc" } };
const CREDENTIAL = { id: "credential-id" };

function setup(options?: {
  autofill?: boolean;
  redirectTo?: string | null;
  onError?: (message: string) => void;
}) {
  const onError = options?.onError ?? vi.fn();
  const view = renderHook(
    ({ autofill }: { autofill: boolean }) =>
      usePasskeySignIn({
        autofill,
        redirectTo: options?.redirectTo,
        onError,
      }),
    { initialProps: { autofill: options?.autofill ?? true } },
  );
  return { ...view, onError };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.browserSupportsWebAuthn.mockReturnValue(true);
  mocks.browserSupportsWebAuthnAutofill.mockResolvedValue(true);
  mocks.requestSignInOptions.mockResolvedValue(FLOW);
  mocks.startAuthentication.mockResolvedValue(CREDENTIAL);
  mocks.signInWithPasskey.mockResolvedValue(true);
});

describe("usePasskeySignIn capability", () => {
  it("reports what the browser can actually do", () => {
    const { result } = setup();
    expect(result.current.supported).toBe(true);
  });

  // A plain-HTTP LAN instance gets no WebAuthn API at all, which is exactly the
  // deployment this has to hide itself on - no server flag involved.
  it("reports no support, and arms nothing, without WebAuthn", async () => {
    mocks.browserSupportsWebAuthn.mockReturnValue(false);

    const { result } = setup();

    expect(result.current.supported).toBe(false);
    await waitFor(() =>
      expect(mocks.requestSignInOptions).not.toHaveBeenCalled(),
    );
  });
});

describe("usePasskeySignIn conditional UI", () => {
  it("arms the browser's autofill dropdown on mount", async () => {
    setup();

    await waitFor(() => expect(mocks.startAuthentication).toHaveBeenCalled());
    expect(mocks.startAuthentication).toHaveBeenCalledWith({
      optionsJSON: FLOW.options,
      useBrowserAutofill: true,
    });
  });

  it("signs in and routes when the diver picks a passkey from the dropdown", async () => {
    setup({ redirectTo: "/dives/abc" });

    await waitFor(() =>
      expect(mocks.router.push).toHaveBeenCalledWith("/dives/abc"),
    );
    expect(mocks.signInWithPasskey).toHaveBeenCalledWith("flow-1", CREDENTIAL);
  });

  it("arms nothing while the form is showing the check-your-email card", async () => {
    setup({ autofill: false });

    await waitFor(() =>
      expect(mocks.browserSupportsWebAuthnAutofill).not.toHaveBeenCalled(),
    );
    expect(mocks.requestSignInOptions).not.toHaveBeenCalled();
  });

  // The per-page-view cost of arming is a POST, so a browser that cannot show
  // conditional UI must not pay it.
  it("asks for no challenge on a browser without conditional UI", async () => {
    mocks.browserSupportsWebAuthnAutofill.mockResolvedValue(false);

    setup();

    await waitFor(() =>
      expect(mocks.browserSupportsWebAuthnAutofill).toHaveBeenCalled(),
    );
    expect(mocks.requestSignInOptions).not.toHaveBeenCalled();
  });

  // An instance whose API predates passkeys 404s here on every page view. Nobody
  // asked for this ceremony, so nothing about it is ever shown.
  it("stays silent when the API has no passkey routes", async () => {
    mocks.requestSignInOptions.mockRejectedValue(new Error("404"));

    const { onError } = setup();

    await waitFor(() => expect(mocks.requestSignInOptions).toHaveBeenCalled());
    expect(onError).not.toHaveBeenCalled();
    expect(mocks.startAuthentication).not.toHaveBeenCalled();
  });

  // Parking on the login page past the challenge's life is the ordinary way to
  // reach a dead challenge, and re-arming on a fresh one is invisible to the
  // diver, who only sees their second tap work.
  it("re-arms once on a fresh challenge when the verify fails", async () => {
    mocks.signInWithPasskey
      .mockRejectedValueOnce(new Error("401"))
      .mockResolvedValueOnce(true);

    const { onError } = setup();

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledTimes(1));
    expect(mocks.requestSignInOptions).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it("stops after the re-armed ceremony fails too", async () => {
    mocks.signInWithPasskey.mockRejectedValue(new Error("401"));

    const { onError } = setup();

    await waitFor(() =>
      expect(mocks.requestSignInOptions).toHaveBeenCalledTimes(2),
    );
    // Nothing further, and nothing said: a second failure is a real one, but it
    // belongs to a ceremony the diver never asked for.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.requestSignInOptions).toHaveBeenCalledTimes(2);
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("stands the ceremony down when the email input leaves", async () => {
    const { rerender } = setup();
    await waitFor(() => expect(mocks.startAuthentication).toHaveBeenCalled());

    rerender({ autofill: false });

    expect(mocks.cancelCeremony).toHaveBeenCalled();
  });

  it("stands the ceremony down on unmount", async () => {
    const { unmount } = setup();
    await waitFor(() => expect(mocks.startAuthentication).toHaveBeenCalled());

    unmount();

    expect(mocks.cancelCeremony).toHaveBeenCalled();
  });
});

describe("usePasskeySignIn explicit ceremony", () => {
  it("runs the modal ceremony on its own fresh challenge", async () => {
    const { result } = setup({ autofill: false });

    await act(() => result.current.signIn());

    expect(mocks.requestSignInOptions).toHaveBeenCalledTimes(1);
    // No `useBrowserAutofill`: this is the browser's own sheet, which is what
    // makes the cross-device QR flow reachable at all.
    expect(mocks.startAuthentication).toHaveBeenCalledWith({
      optionsJSON: FLOW.options,
    });
    expect(mocks.router.push).toHaveBeenCalledWith("/dashboard");
  });

  it("honours where the visitor was headed", async () => {
    const { result } = setup({ autofill: false, redirectTo: "/gear" });

    await act(() => result.current.signIn());

    expect(mocks.router.push).toHaveBeenCalledWith("/gear");
  });

  // The same sanitizing every other entry point applies - a crafted `?next=`
  // must not turn the sign-in form into an open redirect.
  it("refuses a destination that points off-origin", async () => {
    const { result } = setup({
      autofill: false,
      redirectTo: "//evil.example/",
    });

    await act(() => result.current.signIn());

    expect(mocks.router.push).toHaveBeenCalledWith("/dashboard");
  });

  // A passkey always belongs to an existing account today, but the outcome comes
  // from the funnel shared with the other entry points - so the onboarding branch
  // is handled rather than assumed away.
  it("routes to onboarding when the outcome isn't a session", async () => {
    mocks.signInWithPasskey.mockResolvedValue(false);

    const { result } = setup({ autofill: false });

    await act(() => result.current.signIn());

    expect(mocks.router.push).toHaveBeenCalledWith("/onboarding");
  });

  // That `localStorage` slot belongs to the magic link, which leaves the tab and
  // needs somewhere to put the destination. Writing it here would leave a value
  // behind for a later email sign-in to honour.
  it("never writes the magic link's remembered destination", async () => {
    const { result } = setup({ autofill: false, redirectTo: "/dives/abc" });

    await act(() => result.current.signIn());

    expect(mocks.rememberPostAuthRedirect).not.toHaveBeenCalled();
  });

  it("reports the API's own message when the assertion is rejected", async () => {
    mocks.signInWithPasskey.mockRejectedValue({
      response: { data: { detail: "That passkey is not recognised." } },
    });

    const { result, onError } = setup({ autofill: false });
    await act(() => result.current.signIn());

    expect(onError).toHaveBeenCalledWith("That passkey is not recognised.");
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it.each([
    ["the sheet is cancelled", "ERROR_CEREMONY_ABORTED", "AbortError"],
    // The spec deliberately collapses "dismissed", "timed out" and "nothing
    // matched" into one error, so every reading of it is someone who stopped.
    [
      "the diver dismisses the sheet",
      "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      "NotAllowedError",
    ],
  ])("says nothing when %s", async (_case, code, name) => {
    mocks.startAuthentication.mockRejectedValue(
      new mocks.WebAuthnError({ message: "stopped", code, name }),
    );

    const { result, onError } = setup({ autofill: false });
    await act(() => result.current.signIn());

    expect(onError).not.toHaveBeenCalled();
  });

  it("flags itself as in flight only while the ceremony runs", async () => {
    let release: (value: unknown) => void = () => {};
    mocks.startAuthentication.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const { result } = setup({ autofill: false });

    let pending: Promise<void>;
    act(() => {
      pending = result.current.signIn();
    });
    await waitFor(() => expect(result.current.isSigningIn).toBe(true));

    await act(async () => {
      release(CREDENTIAL);
      await pending;
    });
    expect(result.current.isSigningIn).toBe(false);
  });
});
