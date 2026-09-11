import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminInvitesPage from "./page";
import {
  adminAPI,
  type AdminInvitationOutcome,
  type AdminInviteRequest,
} from "@/lib/api/admin";
import { localDay } from "@/test/local-day";

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/lib/api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/admin")>();
  return {
    ...actual,
    adminAPI: {
      listInviteRequests: vi.fn(),
      sendInvitations: vi.fn(),
      removeInviteRequests: vi.fn(),
    },
  };
});

const listInviteRequests = vi.mocked(adminAPI.listInviteRequests);
const sendInvitations = vi.mocked(adminAPI.sendInvitations);
const removeInviteRequests = vi.mocked(adminAPI.removeInviteRequests);

const request = (
  overrides: Partial<AdminInviteRequest> = {},
): AdminInviteRequest => ({
  email: "first@example.com",
  created_at: "2026-09-01T10:00:00+00:00",
  has_account: false,
  ...overrides,
});

const SECOND = request({
  email: "second@example.com",
  created_at: "2026-08-30T09:00:00+00:00",
});

const page = (rows: AdminInviteRequest[], total = rows.length) => ({
  data: rows,
  total_count: total,
  has_more: total > rows.length,
  page: 1,
  items_per_page: 10,
});

const outcomes = (results: AdminInvitationOutcome[]) => ({ results });

beforeEach(() => {
  vi.clearAllMocks();
  // A fresh object per call, which is what a real API client returns and the
  // only shape in which a render loop shows up as a rising call count. See "A
  // shared mock response object hides a render loop" in DECISIONS.md.
  listInviteRequests.mockImplementation(async () => page([request(), SECOND]));
  sendInvitations.mockResolvedValue(
    outcomes([{ email: "first@example.com", outcome: "invited" }]),
  );
  removeInviteRequests.mockResolvedValue({ removed: 1 });
});

// Renders the queue, ticks the named addresses, and presses one of the two
// action buttons through its confirmation.
const act = async (action: "Send invitations" | "Remove", emails: string[]) => {
  render(<AdminInvitesPage />);
  await screen.findByText("first@example.com");

  for (const email of emails) {
    await userEvent.click(
      screen.getByRole("checkbox", { name: `Select ${email}` }),
    );
  }
  await userEvent.click(screen.getByRole("button", { name: action }));
  return screen.findByRole("dialog");
};

const confirm = async (label: "Send" | "Remove") =>
  userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: label,
    }),
  );

describe("the invite queue", () => {
  it("reads the queue once per page load", async () => {
    // The fetch effect is keyed on the fetch callback; a callback rebuilt per
    // render re-runs it on every render the fetch itself causes.
    render(<AdminInvitesPage />);
    await screen.findByText("first@example.com");
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(listInviteRequests).toHaveBeenCalledTimes(1);
  });

  it("lists each address with when it was requested", async () => {
    render(<AdminInvitesPage />);

    const row = (await screen.findByText("first@example.com")).closest("tr");
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent(localDay(request().created_at));
  });

  it("marks a request whose address already has an account", async () => {
    listInviteRequests.mockImplementation(async () =>
      page([request({ has_account: true }), SECOND]),
    );

    render(<AdminInvitesPage />);

    const row = (await screen.findByText("first@example.com")).closest("tr");
    expect(row).toHaveTextContent("Already has an account");
    // The other row is the control: the marker is per address, not per table.
    expect(
      (await screen.findByText("second@example.com")).closest("tr"),
    ).not.toHaveTextContent("Already has an account");
  });

  it("says nothing about how registration on this instance works", async () => {
    // The admin routes carry no registration-mode check, so this page is
    // reachable and works on an instance where anybody may sign up. Copy
    // asserting otherwise would be false there.
    render(<AdminInvitesPage />);
    await screen.findByText("first@example.com");

    expect(document.body.textContent).not.toMatch(
      /invite-only|by invitation|registration is closed|closed beta/i,
    );
  });

  it("offers neither action until something is selected", async () => {
    render(<AdminInvitesPage />);
    await screen.findByText("first@example.com");

    expect(
      screen.getByRole("button", { name: "Send invitations" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  it("selects and clears every row on the page at once", async () => {
    render(<AdminInvitesPage />);
    await screen.findByText("first@example.com");

    const all = screen.getByRole("checkbox", {
      name: "Select every request on this page",
    });
    await userEvent.click(all);
    expect(
      screen.getByRole("checkbox", { name: "Select first@example.com" }),
    ).toBeChecked();

    await userEvent.click(all);
    expect(
      screen.getByRole("checkbox", { name: "Select first@example.com" }),
    ).not.toBeChecked();
  });

  // The queue accumulates as the operator scrolls, and both batch routes reject
  // more than a hundred addresses outright rather than sending part of the
  // batch. Selection used to be held under that ceiling for free, by being
  // cleared on every page turn; loading on scroll is what removed the page turn.
  describe("the hundred-address batch cap", () => {
    const many = Array.from({ length: 130 }, (_, i) =>
      request({ email: `diver${i}@example.com` }),
    );

    beforeEach(() => {
      listInviteRequests.mockImplementation(async () => page(many));
    });

    it("selects at most a full batch, not every row on screen", async () => {
      render(<AdminInvitesPage />);
      await screen.findByText("diver0@example.com");

      await userEvent.click(
        screen.getByRole("checkbox", {
          name: "Select every request on this page",
        }),
      );

      expect(
        await screen.findByText(
          "100 addresses selected - the most one batch can hold",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: "Select diver99@example.com" }),
      ).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Select diver100@example.com" }),
      ).not.toBeChecked();
    });

    it("refuses to tick one past the cap", async () => {
      render(<AdminInvitesPage />);
      await screen.findByText("diver0@example.com");

      await userEvent.click(
        screen.getByRole("checkbox", {
          name: "Select every request on this page",
        }),
      );
      await userEvent.click(
        screen.getByRole("checkbox", { name: "Select diver120@example.com" }),
      );

      expect(
        screen.getByRole("checkbox", { name: "Select diver120@example.com" }),
      ).not.toBeChecked();
      expect(
        screen.getByText(
          "100 addresses selected - the most one batch can hold",
        ),
      ).toBeInTheDocument();
    });
  });
});

describe("sending invitations", () => {
  it("asks before sending, and sends nothing until it is confirmed", async () => {
    await act("Send invitations", ["first@example.com"]);

    expect(sendInvitations).not.toHaveBeenCalled();
  });

  it("posts exactly the selected addresses", async () => {
    await act("Send invitations", ["second@example.com"]);
    await confirm("Send");

    await waitFor(() =>
      expect(sendInvitations).toHaveBeenCalledWith(["second@example.com"]),
    );
  });

  it("reports the outcomes the API returned, not a count of what was sent", async () => {
    // Two addresses go, and only one of them is invited. A summary taken from
    // the selection would claim two.
    sendInvitations.mockResolvedValue(
      outcomes([
        { email: "first@example.com", outcome: "invited" },
        { email: "second@example.com", outcome: "already_registered" },
      ]),
    );

    await act("Send invitations", ["first@example.com", "second@example.com"]);
    await confirm("Send");

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "1 invited, 1 already registered",
        }),
      ),
    );
  });

  it("refetches the queue and clears the selection afterwards", async () => {
    await act("Send invitations", ["first@example.com"]);
    await confirm("Send");

    await waitFor(() => expect(listInviteRequests).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("checkbox", { name: "Select first@example.com" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Send invitations" }),
    ).toBeDisabled();
  });

  it("shows the API's own message on a failure and keeps the selection", async () => {
    sendInvitations.mockRejectedValue({
      response: { data: { detail: "SMTP is not configured." } },
    });

    await act("Send invitations", ["first@example.com"]);
    await confirm("Send");

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "SMTP is not configured.",
          variant: "destructive",
        }),
      ),
    );
    expect(
      screen.getByRole("checkbox", { name: "Select first@example.com" }),
    ).toBeChecked();
  });
});

describe("removing requests", () => {
  it("asks before removing, and removes nothing until it is confirmed", async () => {
    await act("Remove", ["first@example.com"]);

    expect(removeInviteRequests).not.toHaveBeenCalled();
  });

  it("posts the selected addresses and reports the count the API removed", async () => {
    // Not the count that was selected: the sweep or somebody's invitation may
    // have taken a row since the queue was read.
    removeInviteRequests.mockResolvedValue({ removed: 1 });

    await act("Remove", ["first@example.com", "second@example.com"]);
    await confirm("Remove");

    await waitFor(() =>
      expect(removeInviteRequests).toHaveBeenCalledWith([
        "first@example.com",
        "second@example.com",
      ]),
    );
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "1 request removed from the queue.",
      }),
    );
  });

  it("refetches the queue afterwards", async () => {
    await act("Remove", ["first@example.com"]);
    await confirm("Remove");

    await waitFor(() => expect(listInviteRequests).toHaveBeenCalledTimes(2));
  });
});
