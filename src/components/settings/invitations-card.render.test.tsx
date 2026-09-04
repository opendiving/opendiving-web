import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvitationsCard } from "./invitations-card";
import { localDay } from "@/test/local-day";

// What only a render can reach: that the three statuses are legible, that a send
// costs one request rather than two, that revoking asks first, and that the whole
// card removes itself on an instance where anyone may register. The four calls
// behind it are pinned in `lib/api/invitations.test.ts`.
const mocks = vi.hoisted(() => ({
  listInvitations: vi.fn(),
  sendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api/invitations", () => ({
  invitationsAPI: {
    listInvitations: mocks.listInvitations,
    sendInvitation: mocks.sendInvitation,
    revokeInvitation: mocks.revokeInvitation,
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

const PENDING = {
  uuid: "inv-1",
  email: "pending@example.com",
  created_at: "2026-09-01T09:00:00Z",
  accepted_at: null,
  revoked_at: null,
};

const ACCEPTED = {
  uuid: "inv-2",
  email: "accepted@example.com",
  created_at: "2026-08-20T09:00:00Z",
  // Midday UTC on purpose: the date renders in the reader's own timezone.
  accepted_at: "2026-08-22T12:00:00Z",
  revoked_at: null,
};

const REVOKED = {
  uuid: "inv-3",
  email: "revoked@example.com",
  created_at: "2026-08-10T09:00:00Z",
  accepted_at: null,
  revoked_at: "2026-08-11T12:00:00Z",
};

const page = (
  data: unknown[],
  { has_more = false, page = 1 } = {},
): Record<string, unknown> => ({
  data,
  total_count: data.length,
  has_more,
  page,
  items_per_page: 20,
});

const row = (email: string) =>
  screen.getByText(email).closest("div.rounded-lg") as HTMLElement;

const emailField = () => screen.getByLabelText("Email");
const sendButton = () =>
  screen.getByRole("button", { name: /send invitation/i });

beforeEach(() => {
  vi.clearAllMocks();
  // A fresh object per call rather than one shared between them: a mock that
  // hands the same array back on every read makes a re-render that re-reads look
  // identical to one that does not.
  mocks.listInvitations.mockImplementation(() =>
    Promise.resolve(page([PENDING, ACCEPTED, REVOKED])),
  );
  mocks.revokeInvitation.mockResolvedValue({ message: "Invitation revoked" });
});

describe("InvitationsCard", () => {
  it("shows each invitation's status and when it was sent", async () => {
    render(<InvitationsCard />);
    await screen.findByText("pending@example.com");

    expect(
      within(row("pending@example.com")).getByText("Pending"),
    ).toBeVisible();
    expect(
      within(row("accepted@example.com")).getByText(/^Accepted /),
    ).toBeVisible();
    expect(
      within(row("revoked@example.com")).getByText("Revoked"),
    ).toBeVisible();
    expect(row("pending@example.com")).toHaveTextContent(
      `Invited ${localDay(PENDING.created_at)}`,
    );
  });

  // The revoke control is offered against what the row actually is, not against
  // a count: an accepted invitation cannot be taken back and a revoked one is
  // already revoked, and the API answers 409 for the first of those.
  it("offers revoke only on a row that can still be used", async () => {
    render(<InvitationsCard />);
    await screen.findByText("pending@example.com");

    expect(
      screen.getByRole("button", {
        name: /revoke the invitation to pending@/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /revoke the invitation to accepted@/i,
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: /revoke the invitation to revoked@/i,
      }),
    ).toBeNull();
  });

  it("adds the sent invitation from the response rather than re-reading the list", async () => {
    mocks.sendInvitation.mockResolvedValue({
      uuid: "inv-4",
      email: "buddy@example.com",
      created_at: "2026-09-03T09:00:00Z",
      accepted_at: null,
      revoked_at: null,
    });
    const user = userEvent.setup();

    render(<InvitationsCard />);
    await screen.findByText("pending@example.com");

    await user.type(emailField(), "buddy@example.com");
    await user.click(sendButton());

    expect(await screen.findByText("buddy@example.com")).toBeInTheDocument();
    expect(mocks.sendInvitation).toHaveBeenCalledWith("buddy@example.com");
    // The list request is the one from mount and nothing else - the route answers
    // with the row it created, so a second GET would ask for what it already has.
    expect(mocks.listInvitations).toHaveBeenCalledTimes(1);
    // And the field is empty again, ready for the next address.
    expect(emailField()).toHaveValue("");
  });

  it.each([
    [409, "That address already has an account on this instance."],
    [429, "You can send 5 invitations per day."],
  ])("shows the API's %s message verbatim", async (_status, detail) => {
    mocks.sendInvitation.mockRejectedValue({
      response: { status: _status, data: { detail } },
    });
    const user = userEvent.setup();

    render(<InvitationsCard />);
    await screen.findByText("pending@example.com");

    await user.type(emailField(), "buddy@example.com");
    await user.click(sendButton());

    expect(await screen.findByText(detail)).toBeInTheDocument();
  });

  it("revokes only after the confirmation is accepted", async () => {
    const user = userEvent.setup();

    render(<InvitationsCard />);
    await screen.findByText("pending@example.com");

    await user.click(
      screen.getByRole("button", {
        name: /revoke the invitation to pending@/i,
      }),
    );
    // The dialog is up and nothing has been sent yet.
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("pending@example.com");

    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));

    await waitFor(() =>
      expect(mocks.revokeInvitation).toHaveBeenCalledWith("inv-1"),
    );
    // Re-read once, because `revoked_at` is the server's stamp: one read on
    // mount and one after the action, and no more.
    await waitFor(() => expect(mocks.listInvitations).toHaveBeenCalledTimes(2));
  });

  // The whole point of the 404: the card learns the registration mode from the
  // list route rather than from anything the web knows, exactly as the sessions
  // and passkeys cards learn whether their features exist.
  it("removes itself where the API says the feature is absent", async () => {
    mocks.listInvitations.mockRejectedValue({ response: { status: 404 } });

    const { container } = render(<InvitationsCard />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("reports a load failure that is not a 404, and offers a retry", async () => {
    mocks.listInvitations.mockRejectedValueOnce({
      response: { status: 500, data: { detail: "Something broke." } },
    });
    const user = userEvent.setup();

    render(<InvitationsCard />);

    expect(await screen.findByText("Something broke.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("pending@example.com")).toBeInTheDocument();
  });

  it("appends the next page rather than replacing what is on screen", async () => {
    mocks.listInvitations.mockImplementation((requested: number = 1) =>
      Promise.resolve(
        requested === 1
          ? page([PENDING], { has_more: true, page: 1 })
          : page([REVOKED], { has_more: false, page: 2 }),
      ),
    );
    const user = userEvent.setup();

    render(<InvitationsCard />);
    await screen.findByText("pending@example.com");

    await user.click(
      screen.getByRole("button", { name: /show older invitations/i }),
    );

    expect(await screen.findByText("revoked@example.com")).toBeInTheDocument();
    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    expect(mocks.listInvitations).toHaveBeenLastCalledWith(2);
    // And the button goes once there is nothing older left.
    expect(
      screen.queryByRole("button", { name: /show older invitations/i }),
    ).toBeNull();
  });

  // The route pages by offset over a newest-first ordering, so a row created
  // since the first page was read shifts every later row down one — and a send
  // does exactly that locally, without asking the server for a new page number.
  // Page 2 then starts on the row that was the last of page 1. Staged here as
  // the server genuinely behaves: page 2 comes back containing that boundary
  // row, and the card must not render it twice under the same React key.
  it("does not duplicate the boundary row when a send has shifted the pages", async () => {
    mocks.listInvitations.mockImplementation((requested: number = 1) =>
      Promise.resolve(
        requested === 1
          ? page([PENDING, ACCEPTED], { has_more: true, page: 1 })
          : // ACCEPTED has slid onto page 2 because the send pushed everything
            // down one; REVOKED is the genuinely new row.
            page([ACCEPTED, REVOKED], { has_more: false, page: 2 }),
      ),
    );
    mocks.sendInvitation.mockResolvedValue({
      uuid: "inv-4",
      email: "buddy@example.com",
      created_at: "2026-09-03T09:00:00Z",
      accepted_at: null,
      revoked_at: null,
    });
    const user = userEvent.setup();

    render(<InvitationsCard />);
    await screen.findByText("pending@example.com");

    await user.type(emailField(), "buddy@example.com");
    await user.click(sendButton());
    await screen.findByText("buddy@example.com");

    await user.click(
      screen.getByRole("button", { name: /show older invitations/i }),
    );

    expect(await screen.findByText("revoked@example.com")).toBeInTheDocument();
    // The assertion that fails without the dedup: `getAllByText` returns two
    // nodes for the boundary address, which is also two children under one key.
    expect(screen.getAllByText("accepted@example.com")).toHaveLength(1);
  });
});
