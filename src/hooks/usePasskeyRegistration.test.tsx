import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePasskeyRegistration } from "./usePasskeyRegistration";

// `vi.hoisted` because `vi.mock` is lifted above every other statement in the
// file, so plain `const`s declared here would not exist yet when the factories
// run.
const mocks = vi.hoisted(() => {
  // Stands in for the real `WebAuthnError`, which `isCeremonyDismissed` narrows
  // with `instanceof` - so it has to be the same class the code imports, which
  // it is once the module below is mocked with it. The real one is exercised
  // directly in `lib/passkey-ceremony.test.ts`.
  class WebAuthnError extends Error {
    code: string;
    constructor({ code, name }: { code: string; name?: string }) {
      super("ceremony failed");
      this.code = code;
      this.name = name ?? "Error";
    }
  }

  return {
    WebAuthnError,
    browserSupportsWebAuthn: vi.fn<() => boolean>(),
    startRegistration: vi.fn(),
    requestRegistrationOptions: vi.fn(),
    verifyRegistration: vi.fn(),
    suggestPasskeyName: vi.fn<() => string>(),
  };
});

vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: mocks.browserSupportsWebAuthn,
  startRegistration: mocks.startRegistration,
  WebAuthnError: mocks.WebAuthnError,
}));

vi.mock("@/lib/api/passkeys", () => ({
  passkeysAPI: {
    requestRegistrationOptions: mocks.requestRegistrationOptions,
    verifyRegistration: mocks.verifyRegistration,
  },
}));

// The suggestion itself is unit-tested in `lib/passkey-name.test.ts`; what
// matters here is only that whatever it returns reaches the verify call.
vi.mock("@/lib/passkey-name", () => ({
  suggestPasskeyName: mocks.suggestPasskeyName,
}));

const OPTIONS = { challenge: "abc" };
const CREDENTIAL = { id: "credential-id" };
const CREATED = { uuid: "pk-1", name: "Chrome on macOS" };

function setup() {
  const onRegistered = vi.fn();
  const onError = vi.fn();
  const view = renderHook(() =>
    usePasskeyRegistration({ onRegistered, onError }),
  );
  return { ...view, onRegistered, onError };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.browserSupportsWebAuthn.mockReturnValue(true);
  mocks.requestRegistrationOptions.mockResolvedValue(OPTIONS);
  mocks.startRegistration.mockResolvedValue(CREDENTIAL);
  mocks.verifyRegistration.mockResolvedValue(CREATED);
  mocks.suggestPasskeyName.mockReturnValue("Chrome on macOS");
});

describe("usePasskeyRegistration", () => {
  it("runs the three steps and hands back the stored passkey", async () => {
    const { result, onRegistered, onError } = setup();

    await act(() => result.current.register());

    expect(mocks.startRegistration).toHaveBeenCalledWith({
      optionsJSON: OPTIONS,
    });
    expect(mocks.verifyRegistration).toHaveBeenCalledWith(
      CREDENTIAL,
      "Chrome on macOS",
    );
    expect(onRegistered).toHaveBeenCalledWith(CREATED);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports the browser's own capability", () => {
    mocks.browserSupportsWebAuthn.mockReturnValue(false);

    expect(setup().result.current.supported).toBe(false);
  });

  it("stays busy until the callback has run", async () => {
    let finishCallback: () => void = () => {};
    const { result, onRegistered } = setup();
    onRegistered.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishCallback = resolve;
        }),
    );

    let registering: Promise<void>;
    act(() => {
      registering = result.current.register();
    });
    await waitFor(() => expect(result.current.isRegistering).toBe(true));

    await act(async () => {
      finishCallback();
      await registering;
    });
    expect(result.current.isRegistering).toBe(false);
  });

  // A diver who closed the sheet made a choice; saying "couldn't add that
  // passkey" would scold them for it.
  it("says nothing when the diver backs out of the sheet", async () => {
    mocks.startRegistration.mockRejectedValue(
      new mocks.WebAuthnError({
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        name: "NotAllowedError",
      }),
    );
    const { result, onError, onRegistered } = setup();

    await act(() => result.current.register());

    expect(onError).not.toHaveBeenCalled();
    expect(onRegistered).not.toHaveBeenCalled();
    expect(result.current.isRegistering).toBe(false);
  });

  // The 409 an account already at its passkey limit gets: the API's own wording
  // is the only thing that tells the diver what to do, and "please try again" is
  // exactly the wrong advice for it.
  it("shows the API's own message when the verify is refused", async () => {
    mocks.verifyRegistration.mockRejectedValue({
      response: { data: { detail: "You already have 10 passkeys." } },
    });
    const { result, onError, onRegistered } = setup();

    await act(() => result.current.register());

    expect(onError).toHaveBeenCalledWith("You already have 10 passkeys.");
    expect(onRegistered).not.toHaveBeenCalled();
  });

  // The passkey is stored by the time the callback runs, so a list refresh that
  // fails must not come back as "couldn't add" - the diver would try again and
  // meet the duplicate-credential 409.
  it("does not report a failure from the callback as a failed registration", async () => {
    const { result, onRegistered, onError } = setup();
    onRegistered.mockRejectedValue(new Error("refresh failed"));

    await act(() => result.current.register());

    expect(onError).not.toHaveBeenCalled();
    expect(result.current.isRegistering).toBe(false);
  });
});
