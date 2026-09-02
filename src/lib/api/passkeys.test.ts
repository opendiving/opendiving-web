import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { passkeysAPI } from "./passkeys";

// `verifySignIn` captures the session through `lib/api/auth.ts`'s `captureSession`,
// which is left real here - what these tests care about is whether a token is
// stored, and that is `setAccessToken` either way. The other two exports are what
// `auth.ts` itself imports from this module.
vi.mock("./client", () => ({
  apiClient: { post: vi.fn(), get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
}));

const { apiClient, setAccessToken } = await import("./client");
const post = vi.mocked(apiClient.post);
const get = vi.mocked(apiClient.get);
const patch = vi.mocked(apiClient.patch);
const remove = vi.mocked(apiClient.delete);
const storeToken = vi.mocked(setAccessToken);

// Only the fields this module actually moves; the real thing is a good deal
// larger and none of the rest is read on this side of the wire.
const CREDENTIAL = {
  id: "credential-id",
  rawId: "credential-id",
  response: {
    clientDataJSON: "client-data",
    authenticatorData: "authenticator-data",
    signature: "signature",
  },
  type: "public-key",
  clientExtensionResults: {},
} as unknown as AuthenticationResponseJSON;

const REGISTRATION = {
  id: "credential-id",
  rawId: "credential-id",
  response: {
    clientDataJSON: "client-data",
    attestationObject: "attestation-object",
  },
  type: "public-key",
  clientExtensionResults: {},
} as unknown as RegistrationResponseJSON;

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  patch.mockReset();
  remove.mockReset();
  storeToken.mockReset();
});

describe("requestSignInOptions", () => {
  it("asks for a challenge and hands back the flow it was filed under", async () => {
    const flow = { flow_id: "flow-1", options: { challenge: "abc" } };
    post.mockResolvedValue({ data: flow });

    await expect(passkeysAPI.requestSignInOptions()).resolves.toEqual(flow);
    expect(post).toHaveBeenCalledWith("/auth/passkey/options", {});
  });

  // Nothing identifies the visitor here, which is the whole point: an
  // email-first ceremony would answer "does this address have a passkey" for
  // anyone who asked.
  it("sends nothing that could name an account", async () => {
    post.mockResolvedValue({ data: { flow_id: "flow-1", options: {} } });

    await passkeysAPI.requestSignInOptions();

    expect(post.mock.calls[0][1]).toEqual({});
  });
});

describe("verifySignIn", () => {
  // The key names are the contract, not a detail: the API's request model is
  // `extra="forbid"`, so `assertion` here - the word the ceremony's prose uses -
  // would 422 as an unknown field with `credential` reported missing beside it.
  it("posts the credential under the flow id it was minted for", async () => {
    post.mockResolvedValue({ data: { status: "authenticated" } });

    await passkeysAPI.verifySignIn("flow-1", CREDENTIAL);

    expect(post).toHaveBeenCalledWith("/auth/passkey/verify", {
      flow_id: "flow-1",
      credential: CREDENTIAL,
    });
  });

  it("stores the access token when the outcome is a session", async () => {
    post.mockResolvedValue({
      data: { status: "authenticated", access_token: "jwt" },
    });

    const outcome = await passkeysAPI.verifySignIn("flow-1", CREDENTIAL);

    expect(outcome.status).toBe("authenticated");
    expect(storeToken).toHaveBeenCalledWith("jwt");
  });

  // The funnel behind this endpoint is shared with the email and Google entry
  // points, so an onboarding outcome is a shape it can return - and there is no
  // session to store on that branch.
  it("stores nothing when the outcome is an onboarding session", async () => {
    post.mockResolvedValue({
      data: { status: "onboarding_required", onboarding_token: "onb" },
    });

    const outcome = await passkeysAPI.verifySignIn("flow-1", CREDENTIAL);

    expect(outcome.onboarding_token).toBe("onb");
    expect(storeToken).not.toHaveBeenCalled();
  });
});

// The registration half. Same two steps as sign-in, one call shorter on state:
// the challenge is filed under the account rather than under a flow id, so
// nothing has to be carried between the two requests.
describe("requestRegistrationOptions", () => {
  it("unwraps the options the ceremony needs", async () => {
    const options = { challenge: "abc", rp: { id: "localhost" } };
    post.mockResolvedValue({ data: { options } });

    await expect(passkeysAPI.requestRegistrationOptions()).resolves.toEqual(
      options,
    );
    expect(post).toHaveBeenCalledWith("/user/passkey/options", {});
  });
});

describe("verifyRegistration", () => {
  // `extra="forbid"` on the API's request model, exactly as on the sign-in one:
  // a key it doesn't know is a 422 rather than something quietly dropped.
  it("posts the attestation together with the name to file it under", async () => {
    const created = { uuid: "pk-1", name: "Chrome on macOS" };
    post.mockResolvedValue({ data: created });

    await expect(
      passkeysAPI.verifyRegistration(REGISTRATION, "Chrome on macOS"),
    ).resolves.toEqual(created);
    expect(post).toHaveBeenCalledWith("/user/passkey/verify", {
      credential: REGISTRATION,
      name: "Chrome on macOS",
    });
  });
});

describe("management", () => {
  it("lists the account's passkeys", async () => {
    const passkeys = [{ uuid: "pk-1", name: "iPhone" }];
    get.mockResolvedValue({ data: passkeys });

    await expect(passkeysAPI.getPasskeys()).resolves.toEqual(passkeys);
    expect(get).toHaveBeenCalledWith("/user/passkeys");
  });

  // Keyed by public uuid, and sending only the field a diver owns: everything
  // else on a credential is the authenticator's to report or was fixed at
  // registration, and this update schema forbids the rest.
  it("renames one by uuid", async () => {
    patch.mockResolvedValue({ data: { message: "Passkey updated" } });

    await passkeysAPI.renamePasskey("pk-1", "Work laptop");

    expect(patch).toHaveBeenCalledWith("/user/passkey/pk-1", {
      name: "Work laptop",
    });
  });

  it("revokes one by uuid", async () => {
    remove.mockResolvedValue({ data: { message: "Passkey removed" } });

    await passkeysAPI.deletePasskey("pk-1");

    expect(remove).toHaveBeenCalledWith("/user/passkey/pk-1");
  });
});
