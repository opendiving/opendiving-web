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

// The code is six single-character inputs in a `role="group"`, so there is no one
// element to address. Radix labels each box "Character N of 6"; the group carries
// the visible "Or enter the code" text as its own name.
const codeBoxes = () =>
  screen.getAllByRole("textbox", { name: /^Character \d of 6$/ });
const typedCode = () =>
  codeBoxes()
    .map((box) => (box as HTMLInputElement).value)
    .join("");
const verifyButton = () => screen.getByRole("button", { name: /^verify$/i });

// Focus walks itself from box to box as digits land, so the whole code is typed
// into whichever box has focus at the time rather than into a named one.
async function typeCode(
  user: ReturnType<typeof userEvent.setup>,
  digits: string,
) {
  await user.click(codeBoxes()[0]);
  await user.keyboard(digits);
}

describe("CheckEmailCard", () => {
  // The group is what carries the visible label; `htmlFor` has nothing to point
  // at once the field is six inputs rather than one.
  it("names the whole group with the visible label", () => {
    renderCard();

    expect(
      screen.getByRole("group", { name: /enter the code from the email/i }),
    ).toBeInTheDocument();
  });

  it("verifies the typed code against the request that produced it", async () => {
    verifyEmailCode.mockResolvedValue({ status: "authenticated" });
    const user = renderCard("/dives/abc");

    await typeCode(user, "481052");
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

    await typeCode(user, "481052");
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

    await typeCode(user, "481052");
    await user.click(verifyButton());

    expect(router.push).toHaveBeenCalledWith("/restore");
  });

  // Same guard the Google button applies to the same prop: `?next=` reaches this
  // as a URL parameter, so a crafted sign-in link must not turn into a redirect
  // off-origin.
  it("refuses a destination that isn't ours", async () => {
    verifyEmailCode.mockResolvedValue({ status: "authenticated" });
    const user = renderCard("//evil.example");

    await typeCode(user, "481052");
    await user.click(verifyButton());

    expect(router.push).toHaveBeenCalledWith("/dashboard");
  });

  // The email prints the code as "481 052", so the obvious thing a diver does -
  // select it and paste - must not send a space to the API and spend one of the
  // five attempts on a formatting difference. The paste lands on one box and has
  // to fill all six.
  it("spreads a pasted code across the boxes, space and all", async () => {
    verifyEmailCode.mockResolvedValue({ status: "authenticated" });
    const user = renderCard();

    await user.click(codeBoxes()[0]);
    await user.paste("481 052");

    expect(typedCode()).toBe("481052");
    await user.click(verifyButton());
    expect(verifyEmailCode).toHaveBeenCalledWith("req-1", "481052");
  });

  // Letters never reach the value at all - the field is numeric, so a diver who
  // starts typing before noticing the code is digits only isn't left with a
  // half-filled box that looks right.
  it("ignores anything that isn't a digit", async () => {
    const user = renderCard();

    await typeCode(user, "4a8b1c");

    expect(typedCode()).toBe("481");
  });

  // Five wrong attempts kill the code server-side, so a half-typed one must not be
  // submittable at all.
  it("won't submit before all six digits are in", async () => {
    const user = renderCard();

    await typeCode(user, "4810");

    expect(verifyButton()).toBeDisabled();
    await user.keyboard("52");
    expect(verifyButton()).toBeEnabled();
  });

  // Enter inside the field submits the form directly - it never touches the
  // button, so the button being disabled is not what stops a short code here.
  it("won't submit a short code on Enter either", async () => {
    const user = renderCard();

    await typeCode(user, "4810");
    await user.keyboard("{Enter}");

    expect(verifyEmailCode).not.toHaveBeenCalled();
  });

  it("submits a complete code on Enter", async () => {
    verifyEmailCode.mockResolvedValue({ status: "authenticated" });
    const user = renderCard();

    await typeCode(user, "481052");
    await user.keyboard("{Enter}");

    expect(verifyEmailCode).toHaveBeenCalledWith("req-1", "481052");
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

    await typeCode(user, "000000");
    await user.click(verifyButton());

    expect(
      await screen.findByText("Too many requests. Please try again later."),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    // And the form is live again rather than stuck mid-verify - whatever the diver
    // does next, retype or resend, they can do it from here.
    expect(verifyButton()).toBeEnabled();
  });

  // The second of the four doors an uninvited address can reach on an instance
  // that is not taking registrations. The code is right and the refusal comes
  // from the gate behind it, so the message has to say that rather than send the
  // diver off to request another email; it is the API's sentence, verbatim.
  it("shows the gate's refusal for an address nobody invited", async () => {
    verifyEmailCode.mockRejectedValue({
      response: {
        status: 403,
        data: {
          detail:
            "This address hasn't been invited to this instance yet. You can request an invitation from the home page.",
        },
      },
    });
    const user = renderCard();

    await typeCode(user, "123456");
    await user.click(verifyButton());

    expect(
      await screen.findByText(/hasn't been invited to this instance yet/i),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});
