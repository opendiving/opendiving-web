import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VerifyMagicLinkPage from "./page";

// This is the one entry point of four that can tell the truth *before* anything is
// spent: its precheck answers `deletion_pending` on a link that is otherwise
// perfectly valid, so the button can read "Restore my account" rather than "Sign in".
// Two things are worth pinning about that. The label has to follow the precheck, and
// the chained restore has to follow the *outcome* - a deletion requested between the
// precheck and the click arrives at a button that said "Sign in", and that click must
// never quietly restore an account.

const { router, checkEmailLink, verifyEmailLink, restoreAccount, consume } =
  vi.hoisted(() => ({
    router: { replace: vi.fn() },
    checkEmailLink: vi.fn(),
    verifyEmailLink: vi.fn(),
    restoreAccount: vi.fn(),
    consume: vi.fn(() => null as string | null),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams({ token: "tok" }),
}));
vi.mock("@/lib/api/auth", () => ({ authAPI: { checkEmailLink } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ verifyEmailLink, restoreAccount }),
}));
vi.mock("@/lib/auth-redirect", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  consumePostAuthRedirect: consume,
}));

const PENDING = {
  status: "deletion_pending",
  restore_token: "res-1",
  email: "diver@example.com",
  purge_after: "2026-09-04T12:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  consume.mockReturnValue(null);
  restoreAccount.mockResolvedValue(undefined);
});

const pageText = () => document.body.textContent ?? "";

describe("the magic-link landing page", () => {
  it("labels the button for the account it is about to restore", async () => {
    checkEmailLink.mockResolvedValue({
      valid: true,
      email: "diver@example.com",
      deletion_pending: true,
      // Midday UTC on purpose: the date renders in the reader's own timezone.
      purge_after: "2026-09-04T12:00:00Z",
    });

    render(<VerifyMagicLinkPage />);

    expect(
      await screen.findByRole("button", { name: /restore my account/i }),
    ).toBeVisible();
    expect(pageText()).toContain("September");
    expect(screen.queryByRole("button", { name: /^sign in$/i })).toBeNull();
  });

  // The decision was made by clicking a button that said so, which is what lets both
  // halves run from one click here and nowhere else.
  it("carries the restore token straight through after that click", async () => {
    checkEmailLink.mockResolvedValue({
      valid: true,
      email: "diver@example.com",
      deletion_pending: true,
      purge_after: "2026-09-04T12:00:00Z",
    });
    verifyEmailLink.mockResolvedValue(PENDING);
    consume.mockReturnValue("/dives/abc");
    const user = userEvent.setup();

    render(<VerifyMagicLinkPage />);
    await user.click(
      await screen.findByRole("button", { name: /restore my account/i }),
    );

    await waitFor(() => expect(restoreAccount).toHaveBeenCalledWith("res-1"));
    // A restore is a sign-in, so where the visitor was headed still counts.
    expect(router.replace).toHaveBeenCalledWith("/dives/abc");
  });

  // The account was deleted from another device between the precheck and this click.
  // The button said "Sign in", so the offer gets made properly on its own screen
  // rather than being carried out by a click that never asked for it.
  it("offers rather than restores when the button said sign in", async () => {
    checkEmailLink.mockResolvedValue({
      valid: true,
      email: "diver@example.com",
    });
    verifyEmailLink.mockResolvedValue(PENDING);
    const user = userEvent.setup();

    render(<VerifyMagicLinkPage />);
    await user.click(await screen.findByRole("button", { name: /^sign in$/i }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/restore"),
    );
    expect(restoreAccount).not.toHaveBeenCalled();
  });

  it("says a failed restore was a failed restore", async () => {
    checkEmailLink.mockResolvedValue({
      valid: true,
      email: "diver@example.com",
      deletion_pending: true,
      purge_after: "2026-09-04T12:00:00Z",
    });
    verifyEmailLink.mockResolvedValue(PENDING);
    restoreAccount.mockRejectedValue({
      response: {
        data: {
          detail:
            "This account has already been permanently deleted and cannot be restored.",
        },
      },
    });
    const user = userEvent.setup();

    render(<VerifyMagicLinkPage />);
    await user.click(
      await screen.findByRole("button", { name: /restore my account/i }),
    );

    expect(
      await screen.findByText(/couldn't restore your account/i),
    ).toBeVisible();
    expect(pageText()).toContain("already been permanently deleted");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("still signs an ordinary link in", async () => {
    checkEmailLink.mockResolvedValue({
      valid: true,
      email: "diver@example.com",
    });
    verifyEmailLink.mockResolvedValue({ status: "authenticated" });
    const user = userEvent.setup();

    render(<VerifyMagicLinkPage />);
    await user.click(await screen.findByRole("button", { name: /^sign in$/i }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/dashboard"),
    );
    expect(restoreAccount).not.toHaveBeenCalled();
  });

  it("shows an error for a link that is no longer live", async () => {
    checkEmailLink.mockResolvedValue({ valid: false });

    render(<VerifyMagicLinkPage />);

    expect(
      await screen.findByText(/already been used, or is invalid or expired/i),
    ).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
