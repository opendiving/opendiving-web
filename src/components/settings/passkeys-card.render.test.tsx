import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasskeysCard } from "./passkeys-card";
import { dismissPasskeyNudge } from "@/lib/passkey-nudge";
import { memoryStorage, useStorage } from "@/test/memory-storage";

// What only a render can reach: that the list is what a diver can act on - rename
// it, revoke it, add to it - and that the card removes itself where none of that
// is possible. The two calls behind it are pinned in `lib/api/passkeys.test.ts`
// and the ceremony in `hooks/usePasskeyRegistration.test.tsx`.
//
// `vi.hoisted` because `vi.mock` is lifted above every other statement in the
// file, so plain `const`s here would not exist yet when the factories run.
const mocks = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn<() => boolean>(),
  startRegistration: vi.fn(),
  getPasskeys: vi.fn(),
  renamePasskey: vi.fn(),
  deletePasskey: vi.fn(),
  requestRegistrationOptions: vi.fn(),
  verifyRegistration: vi.fn(),
}));

vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: mocks.browserSupportsWebAuthn,
  startRegistration: mocks.startRegistration,
  WebAuthnError: class extends Error {},
}));

vi.mock("@/lib/api/passkeys", () => ({
  passkeysAPI: {
    getPasskeys: mocks.getPasskeys,
    renamePasskey: mocks.renamePasskey,
    deletePasskey: mocks.deletePasskey,
    requestRegistrationOptions: mocks.requestRegistrationOptions,
    verifyRegistration: mocks.verifyRegistration,
  },
}));

const IPHONE = {
  uuid: "pk-1",
  name: "iPhone",
  backed_up: true,
  created_at: "2026-01-12T10:00:00Z",
  last_used_at: "2026-02-03T08:30:00Z",
};

const SECURITY_KEY = {
  uuid: "pk-2",
  name: "YubiKey",
  backed_up: false,
  created_at: "2026-01-20T10:00:00Z",
  last_used_at: null,
};

const row = (name: string) =>
  screen.getByText(name).closest("div.rounded-lg") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  // `window.localStorage` is installed per test rather than used as jsdom
  // provides it - see `test/memory-storage.ts` for why. The card reads the
  // dashboard nudge's dismissal out of it.
  useStorage(memoryStorage());
  mocks.browserSupportsWebAuthn.mockReturnValue(true);
  mocks.getPasskeys.mockResolvedValue([IPHONE, SECURITY_KEY]);
  mocks.renamePasskey.mockResolvedValue(undefined);
  mocks.deletePasskey.mockResolvedValue(undefined);
  mocks.requestRegistrationOptions.mockResolvedValue({ challenge: "abc" });
  mocks.startRegistration.mockResolvedValue({ id: "credential-id" });
  mocks.verifyRegistration.mockResolvedValue({
    ...SECURITY_KEY,
    uuid: "pk-3",
    name: "Chrome on macOS",
  });
});

describe("PasskeysCard", () => {
  it("lists each passkey with when it was added and last used", async () => {
    render(<PasskeysCard />);

    expect(await screen.findByText("iPhone")).toBeInTheDocument();
    expect(row("iPhone")).toHaveTextContent("Added Jan 12, 2026");
    expect(row("iPhone")).toHaveTextContent("Last used Feb 3, 2026");
    // A passkey that has never signed anyone in says so, rather than showing a
    // dash the diver has to interpret.
    expect(row("YubiKey")).toHaveTextContent("Never used");
  });

  // The badge is the difference between a spare key and a single copy: a synced
  // passkey survives a lost phone and one without it does not.
  it("badges only the passkeys the authenticator says are synced", async () => {
    render(<PasskeysCard />);
    await screen.findByText("iPhone");

    expect(within(row("iPhone")).getByText("Synced")).toBeInTheDocument();
    expect(within(row("YubiKey")).queryByText("Synced")).toBeNull();
  });

  it("renames a passkey in place", async () => {
    const user = userEvent.setup();
    render(<PasskeysCard />);
    await screen.findByText("iPhone");

    await user.click(screen.getByRole("button", { name: "Rename iPhone" }));
    const field = screen.getByLabelText("Passkey name");
    await user.clear(field);
    await user.type(field, "Work phone");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() =>
      expect(mocks.renamePasskey).toHaveBeenCalledWith("pk-1", "Work phone"),
    );
    // Patched in place rather than re-read - the list request is the one from
    // mount and nothing else.
    expect(await screen.findByText("Work phone")).toBeInTheDocument();
    expect(mocks.getPasskeys).toHaveBeenCalledTimes(1);
  });

  // An empty name is a 422 rather than a delete, and an unchanged one is a
  // request that can only fail - neither is worth sending.
  it("sends nothing for an emptied or unchanged name", async () => {
    const user = userEvent.setup();
    render(<PasskeysCard />);
    await screen.findByText("iPhone");

    await user.click(screen.getByRole("button", { name: "Rename iPhone" }));
    await user.clear(screen.getByLabelText("Passkey name"));
    await user.click(screen.getByRole("button", { name: "Save name" }));

    expect(mocks.renamePasskey).not.toHaveBeenCalled();
    expect(await screen.findByText("iPhone")).toBeInTheDocument();
  });

  it("leaves the name alone when the rename is cancelled", async () => {
    const user = userEvent.setup();
    render(<PasskeysCard />);
    await screen.findByText("iPhone");

    await user.click(screen.getByRole("button", { name: "Rename iPhone" }));
    await user.type(screen.getByLabelText("Passkey name"), " at home");
    await user.click(screen.getByRole("button", { name: "Cancel rename" }));

    expect(mocks.renamePasskey).not.toHaveBeenCalled();
    expect(screen.getByText("iPhone")).toBeInTheDocument();
  });

  // Revoking is a real delete with nothing to undo it, so it goes through the
  // same confirmation every destructive action in the app does.
  it("revokes a passkey only after the confirmation", async () => {
    const user = userEvent.setup();
    render(<PasskeysCard />);
    await screen.findByText("iPhone");

    await user.click(screen.getByRole("button", { name: "Remove iPhone" }));
    expect(mocks.deletePasskey).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("iPhone");
    mocks.getPasskeys.mockResolvedValue([SECURITY_KEY]);
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(mocks.deletePasskey).toHaveBeenCalledWith("pk-1"),
    );
    await waitFor(() => expect(screen.queryByText("iPhone")).toBeNull());
  });

  it("adds a passkey and re-reads the list", async () => {
    const user = userEvent.setup();
    render(<PasskeysCard />);
    await screen.findByText("iPhone");

    mocks.getPasskeys.mockResolvedValue([
      IPHONE,
      SECURITY_KEY,
      { ...SECURITY_KEY, uuid: "pk-3", name: "Chrome on macOS" },
    ]);
    await user.click(screen.getByRole("button", { name: /add passkey/i }));

    await waitFor(() => expect(mocks.verifyRegistration).toHaveBeenCalled());
    expect(await screen.findByText("Chrome on macOS")).toBeInTheDocument();
  });

  it("says so when the list can't be loaded, and offers a retry", async () => {
    const user = userEvent.setup();
    mocks.getPasskeys.mockRejectedValueOnce({
      response: { status: 500, data: { detail: "Database is down" } },
    });
    render(<PasskeysCard />);

    expect(await screen.findByText("Database is down")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("iPhone")).toBeInTheDocument();
  });

  // An instance whose API predates passkeys 404s here. That is not an error on a
  // settings page - it is a feature this copy of OpenDiving does not have.
  it("removes itself when the API has no passkey routes", async () => {
    mocks.getPasskeys.mockRejectedValue({ response: { status: 404 } });
    const { container } = render(<PasskeysCard />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  // Capability gates the *Add* button, not the list: a diver whose passkeys live
  // on their phone must still be able to revoke one from a laptop that cannot
  // create any.
  it("still lists passkeys on a browser that cannot create them", async () => {
    mocks.browserSupportsWebAuthn.mockReturnValue(false);
    render(<PasskeysCard />);

    expect(await screen.findByText("iPhone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add passkey/i })).toBeNull();
  });

  it("removes itself where there is nothing to manage and nothing to add", async () => {
    mocks.browserSupportsWebAuthn.mockReturnValue(false);
    mocks.getPasskeys.mockResolvedValue([]);
    const { container } = render(<PasskeysCard />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  // The un-dismiss the dashboard offer went without. Until this existed,
  // `opendiving:passkey-nudge-dismissed` was the one stored preference a diver
  // could not even change, which is what §10.3 of the privacy page said about
  // it in as many words.
  describe("the dashboard offer", () => {
    // The only account the dashboard card would ever offer one to: it asks for
    // the passkey list and shows itself only when that comes back empty
    // (`dashboard/passkey-nudge-card.tsx`), so this is the one case where
    // undoing the dismissal genuinely brings the offer back.
    it("comes back for an account with no passkeys yet", async () => {
      const user = userEvent.setup();
      mocks.getPasskeys.mockResolvedValue([]);
      dismissPasskeyNudge();
      render(<PasskeysCard />);
      await screen.findByText(/no passkeys yet/i);

      expect(
        screen.getByText(/the dashboard will offer it again/i),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /undo/i }));

      expect(
        window.localStorage.getItem("opendiving:passkey-nudge-dismissed"),
      ).toBeNull();
      expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
      expect(screen.getByText(/back on your dashboard/i)).toBeInTheDocument();
    });

    // And the case that is most of the people who reach this card, where the
    // same button removes a stored preference but cannot bring anything back.
    // Promising the offer here would be a false claim on the one surface whose
    // whole job is not making them: the dismissal outlives the state that made
    // it relevant, since a diver dismisses the nudge with no passkeys and then
    // adds one.
    it("promises only the removal for an account that already has one", async () => {
      const user = userEvent.setup();
      dismissPasskeyNudge();
      render(<PasskeysCard />);
      await screen.findByText("iPhone");

      expect(
        screen.getByText(/only offers a passkey to an account that has none/i),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /undo/i }));

      expect(
        window.localStorage.getItem("opendiving:passkey-nudge-dismissed"),
      ).toBeNull();
      expect(
        screen.getByText(/no longer holding that dismissal/i),
      ).toBeInTheDocument();
      expect(screen.queryByText(/back on your dashboard/i)).toBeNull();
    });

    // The dismissal lives in this browser and removing it needs no API, so a
    // list that failed to load must not take the removal away - it is the one
    // diver who cannot retry their way into the affordance. The count is
    // unknown there, so the conservative sentence is the honest one.
    it("still offers the removal when the list cannot be loaded", async () => {
      const user = userEvent.setup();
      mocks.getPasskeys.mockRejectedValue({
        response: { status: 500, data: { detail: "Database is down" } },
      });
      dismissPasskeyNudge();
      render(<PasskeysCard />);
      await screen.findByText("Database is down");

      expect(
        screen.getByText(/only offers a passkey to an account that has none/i),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /undo/i }));

      expect(
        window.localStorage.getItem("opendiving:passkey-nudge-dismissed"),
      ).toBeNull();
      expect(screen.queryByText(/back on your dashboard/i)).toBeNull();
    });

    // Nothing stored is nothing to undo - including the case that matters to
    // the device-memory switch, where the dismissal was never written at all.
    it("offers nothing where no dismissal is stored", async () => {
      render(<PasskeysCard />);
      await screen.findByText("iPhone");

      expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
    });
  });
});
