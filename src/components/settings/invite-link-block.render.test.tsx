import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InviteLinkBlock } from "./invite-link-block";

const mocks = vi.hoisted(() => ({
  getInviteLink: vi.fn(),
  createInviteLink: vi.fn(),
  removeInviteLink: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api/invitations", () => ({
  invitationsAPI: {
    getInviteLink: mocks.getInviteLink,
    createInviteLink: mocks.createInviteLink,
    removeInviteLink: mocks.removeInviteLink,
  },
}));
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { name: "Sam Diver" } }),
}));

const TOKEN = "0123456789abcdef0123456789abcdef";
const NEW_TOKEN = "fedcba9876543210fedcba9876543210";
const url = (token: string) => `${window.location.origin}/join?via=${token}`;

const createButton = () =>
  screen.queryByRole("button", { name: /create your invite link/i });
const shareButton = () => screen.queryByRole("button", { name: /^share$/i });
const qr = () => screen.queryByRole("img", { name: /QR code of your invite/ });

function stubShare(share: unknown) {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    writable: true,
    value: share,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getInviteLink.mockResolvedValue({
    token: TOKEN,
    created_at: "2026-10-14T09:00:00Z",
  });
  mocks.createInviteLink.mockResolvedValue({
    token: NEW_TOKEN,
    created_at: "2026-10-14T10:00:00Z",
  });
  mocks.removeInviteLink.mockResolvedValue({ message: "Invite link removed" });
});

afterEach(() => {
  // jsdom has no share sheet of its own; leave it that way for the next test.
  delete (navigator as { share?: unknown }).share;
});

describe("InviteLinkBlock", () => {
  it("offers to make a link where there is none, and says what it is", async () => {
    mocks.getInviteLink.mockResolvedValue(null);
    const user = userEvent.setup();

    render(<InviteLinkBlock />);

    const create = await screen.findByRole("button", {
      name: /create your invite link/i,
    });
    expect(screen.getByText(/as\s+your invitation/)).toHaveTextContent(
      /same allowance as the invitations you\s+send/,
    );
    expect(qr()).toBeNull();

    await user.click(create);

    expect(await screen.findByDisplayValue(url(NEW_TOKEN))).toBeVisible();
    expect(mocks.createInviteLink).toHaveBeenCalledTimes(1);
  });

  it("shows the link as a QR code and an address, with its controls", async () => {
    render(<InviteLinkBlock />);

    const address = await screen.findByDisplayValue(url(TOKEN));
    expect(address).toHaveAttribute("readonly");
    expect(qr()).toBeInTheDocument();
    for (const name of [/^copy$/i, /^reset$/i, /^remove$/i]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(createButton()).toBeNull();
  });

  // The address is the one thing the token is put in, and it goes to the
  // clipboard and nowhere else.
  it("copies exactly the address, and says so", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue();

    render(<InviteLinkBlock />);
    await screen.findByDisplayValue(url(TOKEN));
    await user.click(screen.getByRole("button", { name: /^copy$/i }));

    expect(writeText).toHaveBeenCalledWith(url(TOKEN));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({ title: "Link copied" }),
    );
  });

  it("falls back to a sentence where there is no clipboard", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("NotAllowedError"),
    );

    render(<InviteLinkBlock />);
    await screen.findByDisplayValue(url(TOKEN));
    await user.click(screen.getByRole("button", { name: /^copy$/i }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Select the address and copy it from there.",
        }),
      ),
    );
  });

  it("offers Share only where the browser has a share sheet", async () => {
    render(<InviteLinkBlock />);
    await screen.findByDisplayValue(url(TOKEN));

    expect(shareButton()).toBeNull();
  });

  it("shares the address under the invitation email's subject", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubShare(share);
    const user = userEvent.setup();

    render(<InviteLinkBlock />);
    await screen.findByDisplayValue(url(TOKEN));
    await user.click(shareButton()!);

    expect(share).toHaveBeenCalledWith({
      title: "Sam Diver invited you to OpenDiving",
      url: url(TOKEN),
    });
  });

  it("treats a cancelled share sheet as nothing happening", async () => {
    stubShare(
      vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("cancelled"), { name: "AbortError" }),
        ),
    );
    const user = userEvent.setup();

    render(<InviteLinkBlock />);
    await screen.findByDisplayValue(url(TOKEN));
    await user.click(shareButton()!);
    await Promise.resolve();

    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("resets only after the confirmation, and shows the new link", async () => {
    const user = userEvent.setup();

    render(<InviteLinkBlock />);
    await screen.findByDisplayValue(url(TOKEN));
    await user.click(screen.getByRole("button", { name: /^reset$/i }));

    expect(mocks.createInviteLink).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/stops working for anyone who has it/);
    await user.click(within(dialog).getByRole("button", { name: "Reset" }));

    expect(await screen.findByDisplayValue(url(NEW_TOKEN))).toBeVisible();
    expect(screen.queryByDisplayValue(url(TOKEN))).toBeNull();
  });

  it("removes only after the confirmation, and goes back to offering one", async () => {
    const user = userEvent.setup();

    render(<InviteLinkBlock />);
    await screen.findByDisplayValue(url(TOKEN));
    await user.click(screen.getByRole("button", { name: /^remove$/i }));

    expect(mocks.removeInviteLink).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(
      await screen.findByRole("button", { name: /create your invite link/i }),
    ).toBeInTheDocument();
    expect(mocks.removeInviteLink).toHaveBeenCalledTimes(1);
    expect(qr()).toBeNull();
  });

  it("reports a failed read, and offers a retry", async () => {
    mocks.getInviteLink.mockRejectedValueOnce({
      response: { status: 500, data: { detail: "Something broke." } },
    });
    const user = userEvent.setup();

    render(<InviteLinkBlock />);

    expect(await screen.findByText("Something broke.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByDisplayValue(url(TOKEN))).toBeVisible();
  });
});
