import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { memoryStorage, useStorage } from "@/test/memory-storage";
import { beginGoogleSignIn } from "@/lib/google-oauth";
import GoogleCallbackPage from "./page";

// `vi.hoisted` because `vi.mock` is lifted above every other statement in the
// file. The router is one stable object rather than a fresh one per
// `useRouter()` call, per the convention in `DECISIONS.md`.
const { router, signInWithGoogle, searchParams } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  signInWithGoogle: vi.fn(),
  searchParams: { current: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(searchParams.current),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ signInWithGoogle }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useStorage(memoryStorage());
  searchParams.current = "";
});

// Mints a real attempt through the module the button uses, so what these tests
// exercise is the pair rather than a hand-written storage entry that could drift
// from what is actually written.
async function startAttempt(redirectTo?: string): Promise<string> {
  const url = await beginGoogleSignIn({
    clientId: "test-client.apps.googleusercontent.com",
    redirectTo,
  });
  return new URL(url).searchParams.get("state")!;
}

function renderCallback(query: string, { strict = false } = {}) {
  searchParams.current = query;
  const ui = <GoogleCallbackPage />;
  return render(strict ? <StrictMode>{ui}</StrictMode> : ui);
}

// The error card's heading. The apostrophe class is not fussiness: the page
// writes `&rsquo;`, so a matcher spelling a straight quote silently finds nothing
// and every "an error is shown" assertion becomes unfalsifiable.
const errorText = () => screen.queryByText(/couldn[’']t sign you in/i);

describe("a callback that matches an attempt this browser started", () => {
  it("exchanges the code and lands on the remembered destination", async () => {
    signInWithGoogle.mockResolvedValue({ status: "authenticated" });
    const state = await startAttempt("/dives");

    renderCallback(`code=real-code&state=${state}`);

    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(signInWithGoogle).toHaveBeenCalledWith({
      code: "real-code",
      codeVerifier: expect.stringMatching(/^[A-Za-z0-9\-._~]{43,128}$/),
      redirectUri: `${window.location.origin}/auth/google/callback`,
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dives"));
  });

  // `replace`, not `push`: the authorization code is in this page's own URL, and
  // a pushed entry would leave it in history to be walked back to.
  it("never pushes, so the code does not survive in history", async () => {
    signInWithGoogle.mockResolvedValue({ status: "authenticated" });
    const state = await startAttempt();

    renderCallback(`code=real-code&state=${state}`);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/dashboard"),
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("routes a brand-new account to onboarding rather than its destination", async () => {
    signInWithGoogle.mockResolvedValue({ status: "onboarding_required" });
    const state = await startAttempt("/dives");

    renderCallback(`code=real-code&state=${state}`);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/onboarding"),
    );
  });

  it("shows what the API said when the exchange is refused", async () => {
    signInWithGoogle.mockRejectedValue(new Error("nope"));
    const state = await startAttempt();

    renderCallback(`code=stale-code&state=${state}`);

    await waitFor(() => expect(errorText()).toBeInTheDocument());
    expect(router.replace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: /back to sign in/i }),
    ).toHaveAttribute("href", "/signin");
  });
});

// Google's codes are single-use, and React Strict Mode invokes effects twice in
// development - the environment developers actually use. The guard is a latch
// that survives the remount, deliberately *not* the consumption of the stored
// attempt: consuming before the request would make the second mount look like a
// state that was never issued, and report a failure over a sign-in that had just
// succeeded.
describe("Strict Mode's double invoke", () => {
  it("exchanges the code exactly once", async () => {
    signInWithGoogle.mockResolvedValue({ status: "authenticated" });
    const state = await startAttempt();

    renderCallback(`code=real-code&state=${state}`, { strict: true });

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    // The half that actually falsifies this. A request count cannot tell the two
    // designs apart: with the attempt consumed as the guard, the second invoke
    // finds nothing and returns before posting, so the count is 1 either way -
    // it just renders a failure over the sign-in on its way past.
    expect(errorText()).toBeNull();
  });

  // The same failure caught a beat earlier, on the path where the exchange is
  // genuinely refused. Without a latch the missing-attempt error is on screen
  // *before* the API has answered; the visitor sees a failure the moment they
  // land, and only the message changes when the real answer arrives.
  it("shows nothing until the API has answered", async () => {
    let refuse: (reason: Error) => void;
    signInWithGoogle.mockReturnValue(
      new Promise((_resolve, reject) => {
        refuse = reject;
      }),
    );
    const state = await startAttempt();

    renderCallback(`code=stale-code&state=${state}`, { strict: true });

    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(errorText()).toBeNull();
    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();

    refuse!(new Error("nope"));

    await waitFor(() => expect(errorText()).toBeInTheDocument());
    expect(screen.queryByText(/took too long|didn't come from/i)).toBeNull();
  });
});

describe("a callback that does not match an attempt", () => {
  it.each([
    ["a state this browser never issued", "code=whatever&state=wrong"],
    ["no state at all", "code=whatever"],
    ["no code at all", "state=wrong"],
  ])("performs no exchange for %s", async (_label, query) => {
    await startAttempt();

    renderCallback(query);

    await waitFor(() => expect(errorText()).toBeInTheDocument());
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });

  it("leaves another tab's attempt alone while refusing an unknown state", async () => {
    const mine = await startAttempt("/dives");

    renderCallback("code=whatever&state=someone-elses");

    await waitFor(() => expect(errorText()).toBeInTheDocument());
    // Still consumable, which is the assertion: a mismatched callback must not
    // clear out the attempt a concurrent tab is relying on.
    const { consumeGoogleAttempt } = await import("@/lib/google-oauth");
    expect(consumeGoogleAttempt(mine)?.redirectTo).toBe("/dives");
  });
});

// Cancelling at Google's account chooser is a decision, not a failure. The
// visitor lands back at sign-in with every method available and nothing phrased
// as though something went wrong.
describe("cancelling at Google", () => {
  it("returns to sign-in rather than reporting an error", async () => {
    const state = await startAttempt();

    renderCallback(`error=access_denied&state=${state}`);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/signin"));
    expect(signInWithGoogle).not.toHaveBeenCalled();
    expect(errorText()).toBeNull();
  });

  it("carries the abandoned destination back so a second try still lands there", async () => {
    const state = await startAttempt("/dives");

    renderCallback(`error=access_denied&state=${state}`);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/signin?next=%2Fdives"),
    );
  });

  it("returns to sign-in even when the attempt is already gone", async () => {
    renderCallback("error=access_denied&state=unknown");

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/signin"));
    expect(errorText()).toBeNull();
  });
});
