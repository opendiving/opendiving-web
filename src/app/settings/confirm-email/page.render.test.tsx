import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmEmailChangePage from "./page";

const { checkEmailChangeLink, verifyEmailChange } = vi.hoisted(() => ({
  checkEmailChangeLink: vi.fn(),
  verifyEmailChange: vi.fn(),
}));

// Off the live location, as Next's hook reads it once its router has synced to the
// page's own `replaceState`.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/lib/api/auth", () => ({
  authAPI: { checkEmailChangeLink, verifyEmailChange },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ refreshUser: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/settings/confirm-email?token=tok");
});

describe("the email-change confirmation page", () => {
  // The token leaves the address bar before anyone clicks, and the page must still
  // hold it for the precheck and the click - through Strict Mode's second effect.
  it("checks and spends the token it took out of the address bar", async () => {
    checkEmailChangeLink.mockResolvedValue({
      valid: true,
      email: "new@example.com",
    });
    verifyEmailChange.mockResolvedValue({ email: "new@example.com" });
    const user = userEvent.setup();

    render(
      <StrictMode>
        <ConfirmEmailChangePage />
      </StrictMode>,
    );
    const button = await screen.findByRole("button", {
      name: /confirm email change/i,
    });
    await waitFor(() => expect(window.location.search).toBe(""));
    await user.click(button);

    expect(checkEmailChangeLink).toHaveBeenCalledTimes(1);
    expect(checkEmailChangeLink).toHaveBeenCalledWith("tok");
    await waitFor(() => expect(verifyEmailChange).toHaveBeenCalledWith("tok"));
  });
});
