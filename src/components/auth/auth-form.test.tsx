import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "./auth-form";
import { memoryStorage, useStorage } from "@/test/memory-storage";

// What only a render can reach: which of the two "a link is on its way" paths
// remember the destination. The storage itself is unit-tested in
// `lib/auth-redirect.test.ts`, so it's mocked to a spy here.
//
// `vi.hoisted` because `vi.mock` is lifted above every other statement in the
// file, so a plain `const` here would not exist yet when the factory runs.
const {
  rememberPostAuthRedirect,
  requestEmailLink,
  verifyEmailCode,
  signInWithPasskey,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  cancelCeremony,
  requestSignInOptions,
  router,
} = vi.hoisted(() => ({
  rememberPostAuthRedirect: vi.fn(),
  requestEmailLink: vi.fn(),
  verifyEmailCode: vi.fn(),
  signInWithPasskey: vi.fn(),
  browserSupportsWebAuthn: vi.fn<() => boolean>(),
  browserSupportsWebAuthnAutofill: vi.fn<() => Promise<boolean>>(),
  startAuthentication: vi.fn(),
  cancelCeremony: vi.fn(),
  requestSignInOptions: vi.fn(),
  // One stable object, per `DECISIONS.md` - a fresh router per call re-runs
  // every effect that depends on it.
  router: { push: vi.fn() },
}));

// The sanitizer and the default destination stay real - the passkey ceremony and
// the "check your email" card both route through them. Only the storage write is
// a spy.
vi.mock("@/lib/auth-redirect", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  rememberPostAuthRedirect,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ requestEmailLink, verifyEmailCode, signInWithPasskey }),
}));
// The "check your email" card routes with the router once a code verifies. Its own
// behaviour is covered in `check-email-card.test.tsx`; what these tests need from
// it is only that it is handed the right request id.
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// Pressing the Google button leaves the page entirely - it navigates to Google's
// authorization endpoint - and none of that is what these tests are about. The
// mock stays for that reason now rather than for the script it used to load.
vi.mock("./google-auth-button", () => ({ GoogleAuthButton: () => null }));

// The real hook runs against these, so what these tests exercise is this form's
// own wiring into it - which method is offered, and when the armed ceremony is
// stood down. The ceremony's own behaviour is pinned in
// `hooks/usePasskeySignIn.test.tsx`.
vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  WebAuthnAbortService: { cancelCeremony },
  WebAuthnError: class extends Error {},
}));
vi.mock("@/lib/api/passkeys", () => ({
  passkeysAPI: { requestSignInOptions },
}));

// Captured before any test can fake the clock, so the one unavoidable real wait
// below has something real to wait on.
const realSetTimeout = globalThis.setTimeout;

beforeEach(() => {
  vi.clearAllMocks();
  // `window.localStorage` doesn't work under this runner as jsdom provides it -
  // see `test/memory-storage.ts`. Nothing this form renders reads it any more,
  // which is itself asserted below, and that assertion needs a real object to
  // spy on rather than the `undefined` the runner would otherwise hand it.
  useStorage(memoryStorage());
  requestEmailLink.mockResolvedValue({ message: "sent", request_id: "req-1" });
  verifyEmailCode.mockResolvedValue(true);
  // The default is a browser with no WebAuthn at all, so every test that isn't
  // about passkeys sees exactly the form it always did.
  browserSupportsWebAuthn.mockReturnValue(false);
  browserSupportsWebAuthnAutofill.mockResolvedValue(true);
  requestSignInOptions.mockResolvedValue({
    flow_id: "flow-1",
    options: { challenge: "abc" },
  });
  startAuthentication.mockResolvedValue({ id: "credential-id" });
  signInWithPasskey.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

async function requestLink(redirectTo: string | null) {
  const user = userEvent.setup();
  render(<AuthForm redirectTo={redirectTo} />);

  await user.type(screen.getByLabelText("Email"), "diver@example.com");
  // Anchored, so it can't also match "Sign in with a passkey" beside it.
  await user.click(screen.getByRole("button", { name: /^sign in$/i }));
  await screen.findByText("Check your email");

  return user;
}

// The code field is six single-character inputs in a `role="group"` (Radix's
// one-time-password field), so there is no one element to type into or read back
// - focus walks itself from box to box as digits land. `check-email-card.test.tsx`
// holds the behaviour; these two only need the digits in and the value back out.
const codeBoxes = () =>
  screen.getAllByRole("textbox", { name: /^Character \d of 6$/ });

const typedCode = () =>
  codeBoxes()
    .map((box) => (box as HTMLInputElement).value)
    .join("");

async function typeCode(
  user: ReturnType<typeof userEvent.setup>,
  digits: string,
) {
  await user.click(codeBoxes()[0]);
  await user.keyboard(digits);
}

// Runs out the 30s resend cooldown without waiting 30 seconds.
//
// Two awkward constraints meet here. Testing Library's async helpers don't
// recognise Vitest's fake clock, so anything faked while a `findBy`/`waitFor` is
// outstanding hangs until the test times out - which is why the clock is only
// faked between them, never around them. And the first tick is already pending
// on the real clock by the time this is called, so that one seconds has to
// actually elapse; the twenty-nine after it are scheduled on the fake clock and
// can be stepped through. One second per `act`, because each tick is scheduled
// by the effect that runs after the previous tick's re-render.
async function runOutCooldown() {
  vi.useFakeTimers();
  await act(async () => {
    await new Promise((resolve) => realSetTimeout(resolve, 1100));
  });
  for (let second = 0; second < 30; second++) {
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  }
  vi.useRealTimers();
}

describe("AuthForm heading", () => {
  // The landing page's hero introduces the form itself, so a heading inside the
  // card would only say the same thing twice one level down.
  it("renders no heading when the page didn't ask for one", async () => {
    render(<AuthForm redirectTo={null} />);

    await screen.findByLabelText("Email");
    expect(
      screen.queryByRole("heading", { name: /sign in/i }),
    ).not.toBeInTheDocument();
  });

  // `/signin` is one of the few chrome-free routes that does not already fail
  // axe's `page-has-heading-one`, and moving its heading into the card is what
  // could have cost it that - so the level is asserted, not just the text.
  it("makes the title the page's h1 when one is given", async () => {
    render(
      <AuthForm redirectTo={null} title="Sign in" description="No password." />,
    );

    const heading = await screen.findByRole("heading", { name: "Sign in" });
    expect(heading.tagName).toBe("H1");
    expect(screen.getByText("No password.")).toBeInTheDocument();
  });

  // And it has to survive the swap. `CheckEmailCard` replaces this component
  // outright, so without the level travelling with it the page would lose its
  // only `h1` the moment a link went out.
  it("hands the h1 on to the card that replaces it", async () => {
    const user = userEvent.setup();
    render(<AuthForm redirectTo={null} title="Sign in" />);

    await user.type(screen.getByLabelText("Email"), "diver@example.com");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    const heading = await screen.findByRole("heading", {
      name: "Check your email",
    });
    expect(heading.tagName).toBe("H1");
  });

  // On the landing page it stays an `h3`, nested under the hero's own `h1`.
  it("leaves that card an h3 where the page has its own heading", async () => {
    const user = userEvent.setup();
    render(<AuthForm redirectTo={null} />);

    await user.type(screen.getByLabelText("Email"), "diver@example.com");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    const heading = await screen.findByRole("heading", {
      name: "Check your email",
    });
    expect(heading.tagName).toBe("H3");
  });
});

describe("AuthForm", () => {
  it("remembers where the diver was headed when requesting a link", async () => {
    await requestLink("/dives/abc");

    expect(rememberPostAuthRedirect).toHaveBeenCalledWith("/dives/abc");
  });

  // Called even with nothing to remember, which is what clears a destination
  // abandoned earlier rather than letting it hijack this sign-in.
  it("clears any earlier destination when there's none to store", async () => {
    await requestLink(null);

    expect(rememberPostAuthRedirect).toHaveBeenCalledWith(null);
  });

  // The resent link gets a fresh lifetime from the backend, so the destination
  // needs a fresh one too - see the comment on the call.
  it("re-stamps the destination when the link is resent", async () => {
    const user = await requestLink("/dives/abc");
    rememberPostAuthRedirect.mockClear();

    await runOutCooldown();
    await user.click(screen.getByRole("button", { name: /^resend link$/i }));

    await waitFor(() =>
      expect(rememberPostAuthRedirect).toHaveBeenCalledWith("/dives/abc"),
    );
    expect(requestEmailLink).toHaveBeenCalledTimes(2);
  });

  // A resend supersedes the request row the previous email was about, so the code
  // being typed has to be verified against the *new* one. Getting this wrong is
  // invisible until a diver resends and then types the code they were sent second,
  // which is the ordinary way this screen is used.
  it("verifies the code against the resent link's request, not the first one", async () => {
    const user = await requestLink(null);
    requestEmailLink.mockResolvedValue({
      message: "sent",
      request_id: "req-2",
    });

    await runOutCooldown();
    await user.click(screen.getByRole("button", { name: /^resend link$/i }));
    await screen.findByText("Link resent - check your email.");

    await typeCode(user, "481052");

    expect(verifyEmailCode).toHaveBeenCalledWith("req-2", "481052");
  });

  // The code in the previous email no longer signs anyone in, so leaving it typed
  // would only lead the diver into spending one of five attempts on it.
  //
  // Four digits, not six, and that is the whole point of the case. Six auto-submit
  // the instant the last one lands, which leaves the card mid-verify - so a resend
  // arriving on a *complete* code is a state no diver types their way into, and a
  // test that used one would be asserting against a card that had already signed
  // in. Half-typed is the only way the boxes are still full of a dead code when
  // the resend lands, which is why this is the case worth pinning.
  it("clears a half-typed code when the link is resent", async () => {
    const user = await requestLink(null);

    await typeCode(user, "4810");
    // Both halves of "the resend is what cleared it": the digits really are in
    // the boxes first, and nothing went out - so the failure path, which also
    // clears, cannot be what empties them below.
    expect(typedCode()).toBe("4810");
    expect(verifyEmailCode).not.toHaveBeenCalled();

    await runOutCooldown();
    await user.click(screen.getByRole("button", { name: /^resend link$/i }));

    await waitFor(() => expect(typedCode()).toBe(""));
    expect(verifyEmailCode).not.toHaveBeenCalled();
  });
});

describe("AuthForm passkeys", () => {
  // The plain-HTTP LAN instance, where the browser exposes no WebAuthn API. The
  // method hides itself rather than offering a button that can never work - the
  // same shape `GoogleAuthButton` uses for a missing client ID.
  it("offers no passkey button on a browser without WebAuthn", async () => {
    render(<AuthForm redirectTo={null} />);

    await screen.findByLabelText("Email");
    expect(
      screen.queryByRole("button", { name: /passkey/i }),
    ).not.toBeInTheDocument();
    expect(requestSignInOptions).not.toHaveBeenCalled();
  });

  it("offers one where the browser has WebAuthn", async () => {
    browserSupportsWebAuthn.mockReturnValue(true);

    render(<AuthForm redirectTo={null} />);

    expect(
      await screen.findByRole("button", { name: /sign in with a passkey/i }),
    ).toBeInTheDocument();
  });

  // The dropdown is anchored to this field, and the browser will not arm a
  // conditional ceremony without the `webauthn` token on it.
  it("marks the email field as a passkey autofill target", async () => {
    render(<AuthForm redirectTo={null} />);

    expect(await screen.findByLabelText("Email")).toHaveAttribute(
      "autocomplete",
      "username webauthn",
    );
  });

  it("arms the autofill ceremony on mount", async () => {
    browserSupportsWebAuthn.mockReturnValue(true);

    render(<AuthForm redirectTo={null} />);

    await waitFor(() =>
      expect(startAuthentication).toHaveBeenCalledWith(
        expect.objectContaining({ useBrowserAutofill: true }),
      ),
    );
  });

  // The "check your email" card replaces the whole form, taking the input the
  // ceremony is anchored to with it.
  it("stands the ceremony down when the sent card replaces the form", async () => {
    browserSupportsWebAuthn.mockReturnValue(true);

    await requestLink(null);

    expect(cancelCeremony).toHaveBeenCalled();
  });
});

// This form used to open with a line naming the method this browser signed in
// with last, read out of a key written on every sign-in. Both are gone, and the
// two halves of that are worth pinning separately: a returning visitor is told
// nothing, and the form does not go looking. The second is the half a rendered
// assertion cannot see - a build that still read the key but rendered nothing
// would pass the first test while storing and reading exactly as before.
describe("AuthForm and the browser's sign-in history", () => {
  it("says nothing about how this browser signed in before", async () => {
    render(<AuthForm redirectTo={null} />);

    await screen.findByLabelText("Email");
    expect(screen.queryByText(/last time you signed in/i)).toBeNull();
    // Still every method, in the order they were always in.
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("reads nothing out of this browser's storage", async () => {
    const getItem = vi.spyOn(window.localStorage, "getItem");

    render(<AuthForm redirectTo={null} />);

    await screen.findByLabelText("Email");
    expect(getItem).not.toHaveBeenCalled();
  });
});
