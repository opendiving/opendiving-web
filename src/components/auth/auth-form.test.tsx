import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "./auth-form";

// What only a render can reach: which of the two "a link is on its way" paths
// remember the destination. The storage itself is unit-tested in
// `lib/auth-redirect.test.ts`, so it's mocked to a spy here.
//
// `vi.hoisted` because `vi.mock` is lifted above every other statement in the
// file, so a plain `const` here would not exist yet when the factory runs.
const { rememberPostAuthRedirect, requestEmailLink, verifyEmailCode, router } =
  vi.hoisted(() => ({
    rememberPostAuthRedirect: vi.fn(),
    requestEmailLink: vi.fn(),
    verifyEmailCode: vi.fn(),
    router: { push: vi.fn() },
  }));

vi.mock("@/lib/auth-redirect", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  rememberPostAuthRedirect,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ requestEmailLink, verifyEmailCode }),
}));
// The "check your email" card routes with the router once a code verifies. Its own
// behaviour is covered in `check-email-card.test.tsx`; what these tests need from
// it is only that it is handed the right request id.
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// Google Identity Services loads a real script and renders into a real DOM node;
// none of that is what these tests are about.
vi.mock("./google-auth-button", () => ({ GoogleAuthButton: () => null }));

// Captured before any test can fake the clock, so the one unavoidable real wait
// below has something real to wait on.
const realSetTimeout = globalThis.setTimeout;

beforeEach(() => {
  vi.clearAllMocks();
  requestEmailLink.mockResolvedValue({ message: "sent", request_id: "req-1" });
  verifyEmailCode.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

async function requestLink(redirectTo: string | null) {
  const user = userEvent.setup();
  render(<AuthForm redirectTo={redirectTo} />);

  await user.type(screen.getByLabelText("Email"), "diver@example.com");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  await screen.findByText("Check your email");

  return user;
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

    await user.type(screen.getByLabelText(/enter the code/i), "481052");
    await user.click(screen.getByRole("button", { name: /^verify$/i }));

    expect(verifyEmailCode).toHaveBeenCalledWith("req-2", "481052");
  });

  // The code in the previous email no longer signs anyone in, so leaving it typed
  // would only lead the diver into spending one of five attempts on it.
  it("clears a half-typed code when the link is resent", async () => {
    const user = await requestLink(null);

    await user.type(screen.getByLabelText(/enter the code/i), "481052");
    await runOutCooldown();
    await user.click(screen.getByRole("button", { name: /^resend link$/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/enter the code/i)).toHaveValue(""),
    );
  });
});
