import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RestoreAccountCard } from "./restore-account-card";

// The screen is an offer, and the offer is the only thing standing between a diver
// and a logbook that gets erased on a date they can read here. So what is worth
// pinning is that the date survives to the screen in every shape the API can send it,
// that the click actually spends the token it was handed, and that a refusal is shown
// rather than swallowed - a failed restore leaves the account exactly as deleted as it
// was, and the diver has to be told which failure they hit.

const { router, restoreAccount, auth } = vi.hoisted(() => ({
  router: { push: vi.fn() },
  restoreAccount: vi.fn(),
  auth: {
    restore: null as {
      restoreToken: string;
      email: string;
      purgeAfter: string | null;
    } | null,
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ restore: auth.restore, restoreAccount }),
}));

const OFFER = {
  restoreToken: "res-1",
  email: "diver@example.com",
  // Midday UTC on purpose: the date renders in the reader's own timezone, and a
  // midnight one would land on a different day either side of the world.
  purgeAfter: "2026-09-04T12:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.restore = OFFER;
  restoreAccount.mockResolvedValue(undefined);
});

const pageText = () => document.body.textContent ?? "";
const restoreButton = () =>
  screen.getByRole("button", { name: /restore my account/i });

describe("the restore offer", () => {
  it("names the account and the day it stops being recoverable", () => {
    render(<RestoreAccountCard />);

    expect(pageText()).toContain("diver@example.com");
    expect(pageText()).toContain("September");
    expect(pageText()).toContain("2026");
  });

  // The API leaves `purge_after` out for a row flagged with no clock to count from.
  // The offer still stands - it just cannot name a day, and must not render one.
  it("still offers the account back with no date to name", () => {
    auth.restore = { ...OFFER, purgeAfter: null };

    render(<RestoreAccountCard />);

    expect(pageText()).not.toContain("Invalid Date");
    expect(restoreButton()).toBeVisible();
  });

  it("spends the token it was handed and signs the diver back in", async () => {
    const user = userEvent.setup();
    render(<RestoreAccountCard />);

    await user.click(restoreButton());

    expect(restoreAccount).toHaveBeenCalledWith("res-1");
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard"));
  });

  // The one refusal a diver most needs stated plainly: the purge ran while the offer
  // was on screen. A generic "please try again" would send them looking for another
  // way in that cannot exist.
  it("shows the API's own explanation when the account is already gone", async () => {
    restoreAccount.mockRejectedValue({
      response: {
        data: {
          detail:
            "This account has already been permanently deleted and cannot be restored.",
        },
      },
    });
    const user = userEvent.setup();
    render(<RestoreAccountCard />);

    await user.click(restoreButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /already been permanently deleted/i,
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  // Nothing to offer means nothing to render: the page above sends the visitor back
  // to sign in again, and a card drawing an empty offer in the meantime would ask
  // them to click a button holding no token.
  it("renders nothing without an offer", () => {
    auth.restore = null;

    const { container } = render(<RestoreAccountCard />);

    expect(container).toBeEmptyDOMElement();
  });
});
