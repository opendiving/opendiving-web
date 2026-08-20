import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasskeyNudgeCard } from "./passkey-nudge-card";
import { memoryStorage, useStorage } from "@/test/memory-storage";

// The card is three conditions and two buttons, and the conditions are the point:
// it must not ask the API anything on the dashboards where it could never show,
// and it must not come back once it has been answered.
//
// `vi.hoisted` because `vi.mock` is lifted above every other statement in the
// file, so plain `const`s here would not exist yet when the factories run.
const mocks = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn<() => boolean>(),
  startRegistration: vi.fn(),
  getPasskeys: vi.fn(),
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
    requestRegistrationOptions: mocks.requestRegistrationOptions,
    verifyRegistration: mocks.verifyRegistration,
  },
}));

// The headline, which the "Add a passkey" button below it would otherwise also
// match.
const offer = () => screen.findByText(/sign in faster next time/i);
const addButton = () => screen.getByRole("button", { name: /add a passkey/i });

beforeEach(() => {
  vi.clearAllMocks();
  // `window.localStorage` is installed per test rather than used as jsdom
  // provides it - see `test/memory-storage.ts` for why.
  useStorage(memoryStorage());
  mocks.browserSupportsWebAuthn.mockReturnValue(true);
  mocks.getPasskeys.mockResolvedValue([]);
  mocks.requestRegistrationOptions.mockResolvedValue({ challenge: "abc" });
  mocks.startRegistration.mockResolvedValue({ id: "credential-id" });
  mocks.verifyRegistration.mockResolvedValue({ uuid: "pk-1", name: "iPhone" });
});

describe("PasskeyNudgeCard", () => {
  it("offers a passkey to an account that has none", async () => {
    render(<PasskeyNudgeCard />);

    expect(await offer()).toBeInTheDocument();
  });

  it("stays away once the account has one", async () => {
    mocks.getPasskeys.mockResolvedValue([{ uuid: "pk-1", name: "iPhone" }]);
    const { container } = render(<PasskeyNudgeCard />);

    await waitFor(() => expect(mocks.getPasskeys).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  // The steady state after a dismissal is *no request at all* - this card is on
  // every dashboard view, and a diver who said "not now" should not be paying
  // for it on each one.
  it("asks the API nothing where it could never show", async () => {
    mocks.browserSupportsWebAuthn.mockReturnValue(false);
    const { container, unmount } = render(<PasskeyNudgeCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    unmount();

    mocks.browserSupportsWebAuthn.mockReturnValue(true);
    window.localStorage.setItem("opendiving:passkey-nudge-dismissed", "1");
    render(<PasskeyNudgeCard />);

    await waitFor(() => expect(mocks.getPasskeys).not.toHaveBeenCalled());
  });

  it("remembers a dismissal for the next dashboard visit", async () => {
    const user = userEvent.setup();
    render(<PasskeyNudgeCard />);
    await offer();

    await user.click(screen.getByRole("button", { name: /not now/i }));

    await waitFor(() => expect(screen.queryByText(/not now/i)).toBeNull());
    expect(
      window.localStorage.getItem("opendiving:passkey-nudge-dismissed"),
    ).not.toBeNull();
  });

  // The click *is* the user gesture Safari requires for `credentials.create()`,
  // which is why nothing here fires a ceremony on its own.
  it("runs the ceremony from the button and then goes away", async () => {
    const user = userEvent.setup();
    render(<PasskeyNudgeCard />);
    await offer();

    expect(mocks.startRegistration).not.toHaveBeenCalled();
    await user.click(addButton());

    await waitFor(() => expect(mocks.verifyRegistration).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/not now/i)).toBeNull());
    // Taken, not dismissed: nothing is written, because the account having a
    // passkey is what keeps the card away from here on.
    expect(
      window.localStorage.getItem("opendiving:passkey-nudge-dismissed"),
    ).toBeNull();
  });

  // A supplementary card on a page full of them: an API with no passkey routes
  // 404s here, and that is not something to put in front of a diver.
  it("stays quiet when the list request fails", async () => {
    mocks.getPasskeys.mockRejectedValue({ response: { status: 404 } });
    const { container } = render(<PasskeyNudgeCard />);

    await waitFor(() => expect(mocks.getPasskeys).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
