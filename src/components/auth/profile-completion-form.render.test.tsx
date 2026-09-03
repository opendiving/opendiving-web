import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileCompletionForm } from "./profile-completion-form";

// The fourth door, and the least obvious one. The other three refuse *before* an
// onboarding token is minted; this form is where the account is actually created,
// and the gate is checked again inside the creating transaction - so a revocation
// committed while the diver was filling this in, or the loser of the race for the
// first account on an empty instance, is refused here and nowhere earlier.
//
// The form already routes every API error through `getApiErrorMessage` into
// `StatusMessage`, so this is a pin rather than new behaviour: what it holds is
// that the refusal stays inline and legible on the page the diver is on, instead
// of becoming a navigation or a generic "could not complete your profile".
const { router, completeProfile } = vi.hoisted(() => ({
  router: { push: vi.fn() },
  completeProfile: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    onboarding: { email: "stranger@example.com", name: "Sam" },
    completeProfile,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

async function submit() {
  const user = userEvent.setup();
  render(<ProfileCompletionForm />);
  await user.type(screen.getByLabelText(/username/i), "samreef");
  await user.click(screen.getByRole("button", { name: /finish setting up/i }));
  return user;
}

describe("ProfileCompletionForm", () => {
  it("shows the gate's refusal inline and stays on the form", async () => {
    completeProfile.mockRejectedValue({
      response: {
        status: 403,
        data: {
          detail:
            "This address hasn't been invited to this instance yet. You can request an invitation from the home page.",
        },
      },
    });

    await submit();

    expect(
      await screen.findByText(/hasn't been invited to this instance yet/i),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("still creates the account when the gate lets the address through", async () => {
    completeProfile.mockResolvedValue(undefined);

    await submit();

    expect(completeProfile).toHaveBeenCalledWith("Sam", "samreef");
    expect(router.push).toHaveBeenCalledWith("/dashboard");
  });
});
