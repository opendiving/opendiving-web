import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckEmailCard } from "./check-email-card";

// `vi.hoisted` because `vi.mock` is lifted above every other statement in the
// file, so a plain `const` here would not exist yet when the factory runs. The
// router is one stable object rather than a fresh one per `useRouter()` call, per
// the convention in `DECISIONS.md` - Next's own returns a stable reference.
const { router, verifyEmailCode } = vi.hoisted(() => ({
  router: { push: vi.fn() },
  verifyEmailCode: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ verifyEmailCode }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function renderCard(redirectTo: string | null = null) {
  const user = userEvent.setup();
  render(
    <CheckEmailCard
      email="diver@example.com"
      requestId="req-1"
      redirectTo={redirectTo}
      onResend={vi.fn().mockResolvedValue(undefined)}
      onUseDifferentEmail={vi.fn()}
    />,
  );
  return user;
}

const codeInput = () => screen.getByLabelText(/enter the code/i);
const verifyButton = () => screen.getByRole("button", { name: /^verify$/i });

describe("CheckEmailCard", () => {
  it("verifies the typed code against the request that produced it", async () => {
    verifyEmailCode.mockResolvedValue({ status: "authenticated" });
    const user = renderCard("/dives/abc");

    await user.type(codeInput(), "481052");
    await user.click(verifyButton());

    expect(verifyEmailCode).toHaveBeenCalledWith("req-1", "481052");
    // In-tab, so the destination is the prop - not the `localStorage` value that
    // only `/auth/verify` consumes.
    expect(router.push).toHaveBeenCalledWith("/dives/abc");
  });

  // The funnel treats a code exactly like the link, so a brand-new account starts
  // onboarding rather than getting a session.
  it("sends a diver with no account yet to onboarding", async () => {
    verifyEmailCode.mockResolvedValue({
      status: "onboarding_required",
    });
    const user = renderCard("/dives/abc");

    await user.type(codeInput(), "481052");
    await user.click(verifyButton());

    expect(router.push).toHaveBeenCalledWith("/onboarding");
  });

  // The third outcome, and the one the code path cannot warn about in advance: it
  // claims its request row before the account is even resolved, so this screen has
  // already spent the code by the time it learns the account is pending deletion.
  it("sends an account pending deletion to the restore offer", async () => {
    verifyEmailCode.mockResolvedValue({
      status: "deletion_pending",
      restore_token: "res",
      email: "diver@example.com",
      purge_after: "2026-09-04T12:00:00Z",
    });
    const user = renderCard("/dives/abc");

    await user.type(codeInput(), "481052");
    await user.click(verifyButton());

    expect(router.push).toHaveBeenCalledWith("/restore");
  });

  // Same guard the Google button applies to the same prop: `?next=` reaches this
  // as a URL parameter, so a crafted sign-in link must not turn into a redirect
  // off-origin.
  it("refuses a destination that isn't ours", async () => {
    verifyEmailCode.mockResolvedValue({ status: "authenticated" });
    const user = renderCard("//evil.example");

    await user.type(codeInput(), "481052");
    await user.click(verifyButton());

    expect(router.push).toHaveBeenCalledWith("/dashboard");
  });

  // The email prints the code as "481 052", so the obvious thing a diver does -
  // select it and paste - must not send a space to the API and spend one of the
  // five attempts on a formatting difference.
  it("drops the space out of a pasted code", async () => {
    verifyEmailCode.mockResolvedValue({ status: "authenticated" });
    const user = renderCard();

    await user.click(codeInput());
    await user.paste("481 052");

    expect(codeInput()).toHaveValue("481052");
    await user.click(verifyButton());
    expect(verifyEmailCode).toHaveBeenCalledWith("req-1", "481052");
  });

  // Five wrong attempts kill the code server-side, so a half-typed one must not be
  // submittable at all.
  it("won't submit before all six digits are in", async () => {
    const user = renderCard();

    await user.type(codeInput(), "4810");

    expect(verifyButton()).toBeDisabled();
    await user.type(codeInput(), "52");
    expect(verifyButton()).toBeEnabled();
  });

  // The API's own wording rather than this component's fallback, which matters
  // because the two carry different advice. Every *code* rejection is deliberately
  // one sentence - wrong digits, an unknown request, an expired row and a spent
  // attempt budget alike, so nothing leaks about a row the caller cannot name - but
  // the endpoint's per-IP rate limit answers 429 with its own message, and that one
  // means "waiting is the fix", which a fallback about the code being invalid would
  // send the diver away from. Hence the rate-limit message here: it is the case that
  // actually distinguishes the two. It also has to stay on screen, since a toast
  // would fade while they are still reading the email.
  it("shows the API's own message when the code is rejected, and stays put", async () => {
    verifyEmailCode.mockRejectedValue({
      response: {
        data: { detail: "Too many requests. Please try again later." },
      },
    });
    const user = renderCard();

    await user.type(codeInput(), "000000");
    await user.click(verifyButton());

    expect(
      await screen.findByText("Too many requests. Please try again later."),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    // And the form is live again rather than stuck mid-verify - whatever the diver
    // does next, retype or resend, they can do it from here.
    expect(verifyButton()).toBeEnabled();
  });
});
