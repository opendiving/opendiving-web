import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionsCard } from "./sessions-card";

// What only a render can reach: that the current row is marked and offers nothing
// to revoke, that the two revoke paths are both gated on a confirmation, and that
// the card removes itself where the API has no such routes. The three calls under
// it are pinned in `lib/api/sessions.test.ts`, and the device labelling in
// `lib/passkey-name.test.ts`.
//
// `vi.hoisted` because `vi.mock` is lifted above every other statement in the
// file, so plain `const`s here would not exist yet when the factories run.
const mocks = vi.hoisted(() => ({
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api/sessions", () => ({
  sessionsAPI: {
    listSessions: mocks.listSessions,
    revokeSession: mocks.revokeSession,
    revokeOtherSessions: mocks.revokeOtherSessions,
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const FIREFOX_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0";

// Factories rather than shared objects, for the reason `DECISIONS.md` records
// under "A shared mock response object hides a render loop": a mock that hands
// every call the same array lets React bail out of the re-render, which stalls a
// loop instead of exposing it and makes a call-count assertion pass with the bug
// in place.
const thisDevice = () => ({
  uuid: "sess-1",
  created_at: "2026-08-20T09:00:00Z",
  last_used_at: "2026-08-29T14:12:00Z",
  ip: "203.0.113.7",
  user_agent: CHROME_MAC,
  current: true,
});

const otherDevice = () => ({
  uuid: "sess-2",
  created_at: "2026-08-18T21:40:00Z",
  last_used_at: "2026-08-28T02:14:00Z",
  ip: "198.51.100.22",
  user_agent: FIREFOX_LINUX,
  current: false,
});

const unlabelled = () => ({
  uuid: "sess-3",
  created_at: "2026-08-27T11:00:00Z",
  last_used_at: "2026-08-27T11:05:00Z",
  ip: "192.0.2.9",
  user_agent: "",
  current: false,
});

const row = (name: string) =>
  screen.getByText(name).closest("div.rounded-lg") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSessions.mockImplementation(async () => [
    thisDevice(),
    otherDevice(),
  ]);
  mocks.revokeSession.mockResolvedValue(undefined);
  mocks.revokeOtherSessions.mockImplementation(async () => ({
    message: "Other sessions revoked",
    revoked: 1,
  }));
});

describe("SessionsCard", () => {
  it("lists each device with where it signed in from and when it was last used", async () => {
    render(<SessionsCard />);

    expect(await screen.findByText("Chrome on macOS")).toBeInTheDocument();
    expect(row("Chrome on macOS")).toHaveTextContent("203.0.113.7");
    // With the time of day, unlike a passkey's added-date: the hour is the whole
    // question for someone deciding whether they recognise a session.
    expect(row("Firefox on Linux")).toHaveTextContent(
      /Last used Aug \d{1,2}, 2026, \d{2}:\d{2}/,
    );
  });

  // A client that sent no User-Agent at all still gets a row, because a session
  // nobody can see is a session nobody can revoke.
  it("still names and offers a row whose user agent is empty", async () => {
    mocks.listSessions.mockImplementation(async () => [
      thisDevice(),
      unlabelled(),
    ]);
    render(<SessionsCard />);

    expect(await screen.findByText("Unknown device")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out Unknown device" }),
    ).toBeInTheDocument();
  });

  // The owner's call, and the reason the API's 409 is a backstop rather than the
  // UX: ending your own session is what signing out is, so this row is marked and
  // carries no control at all - not a disabled one, which would read as broken.
  it("marks the current device and offers no way to revoke it", async () => {
    render(<SessionsCard />);
    await screen.findByText("Chrome on macOS");

    expect(
      within(row("Chrome on macOS")).getByText("This device"),
    ).toBeInTheDocument();
    expect(
      within(row("Firefox on Linux")).queryByText("This device"),
    ).toBeNull();

    expect(
      screen.queryByRole("button", { name: "Sign out Chrome on macOS" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Sign out Firefox on Linux" }),
    ).toBeInTheDocument();
  });

  it("revokes one session only after the confirmation", async () => {
    const user = userEvent.setup();
    render(<SessionsCard />);
    await screen.findByText("Firefox on Linux");

    await user.click(
      screen.getByRole("button", { name: "Sign out Firefox on Linux" }),
    );
    expect(mocks.revokeSession).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Firefox on Linux");
    mocks.listSessions.mockImplementation(async () => [thisDevice()]);
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(mocks.revokeSession).toHaveBeenCalledWith("sess-2"),
    );
    await waitFor(() =>
      expect(screen.queryByText("Firefox on Linux")).toBeNull(),
    );
  });

  describe("signing every other device out", () => {
    it("reports the count the API returned, not one it worked out itself", async () => {
      const user = userEvent.setup();
      mocks.listSessions.mockImplementation(async () => [
        thisDevice(),
        otherDevice(),
        { ...unlabelled(), current: false },
      ]);
      mocks.revokeOtherSessions.mockImplementation(async () => ({
        message: "Other sessions revoked",
        revoked: 2,
      }));
      render(<SessionsCard />);
      await screen.findByText("Firefox on Linux");

      await user.click(
        screen.getByRole("button", { name: /sign out other sessions/i }),
      );
      expect(mocks.revokeOtherSessions).not.toHaveBeenCalled();

      const dialog = await screen.findByRole("dialog");
      mocks.listSessions.mockImplementation(async () => [thisDevice()]);
      await user.click(
        within(dialog).getByRole("button", { name: "Sign them out" }),
      );

      await waitFor(() => expect(mocks.revokeOtherSessions).toHaveBeenCalled());
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "2 other devices were signed out.",
        }),
      );
      // And the list is re-read, so the card stops showing rows that are gone.
      await waitFor(() =>
        expect(screen.queryByText("Firefox on Linux")).toBeNull(),
      );
    });

    it("says it in the singular for one device", async () => {
      const user = userEvent.setup();
      render(<SessionsCard />);
      await screen.findByText("Firefox on Linux");

      await user.click(
        screen.getByRole("button", { name: /sign out other sessions/i }),
      );
      const dialog = await screen.findByRole("dialog");
      await user.click(
        within(dialog).getByRole("button", { name: "Sign them out" }),
      );

      await waitFor(() =>
        expect(mocks.toast).toHaveBeenCalledWith(
          expect.objectContaining({
            description: "1 other device was signed out.",
          }),
        ),
      );
    });

    // Nothing to sign out but this browser, so nothing to offer. The button is
    // gated on there actually being another row - is there another device - and
    // not on a count, which only approximates that question.
    it("is not offered when this device is the only one signed in", async () => {
      mocks.listSessions.mockImplementation(async () => [thisDevice()]);
      render(<SessionsCard />);
      await screen.findByText("Chrome on macOS");

      expect(
        screen.queryByRole("button", { name: /sign out other sessions/i }),
      ).toBeNull();
    });
  });

  it("says so when the list can't be loaded, and offers a retry", async () => {
    const user = userEvent.setup();
    mocks.listSessions.mockRejectedValueOnce({
      response: { status: 500, data: { detail: "Database is down" } },
    });
    render(<SessionsCard />);

    expect(await screen.findByText("Database is down")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Chrome on macOS")).toBeInTheDocument();
  });

  // An instance whose API predates server-side sessions 404s here. That is not an
  // error on a settings page - it is a feature this copy of OpenDiving does not
  // have, so the card goes rather than explaining itself.
  it("removes itself when the API has no session routes", async () => {
    mocks.listSessions.mockRejectedValue({ response: { status: 404 } });
    const { container } = render(<SessionsCard />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  // The loop pin. It has to be written with `mockImplementation` returning a
  // fresh array per call: with `mockResolvedValue` every call hands React the
  // array it already holds, it bails out of the re-render, and the count sits at
  // 1 whether or not anything is looping.
  it("reads the session list once, not once per render", async () => {
    render(<SessionsCard />);
    await screen.findByText("Chrome on macOS");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mocks.listSessions).toHaveBeenCalledTimes(1);
  });
});
