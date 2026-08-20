import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

import { captureSession, type AuthOutcome } from "./auth";
import { apiClient } from "./client";

/**
 * One armed sign-in ceremony: the challenge the API minted, plus the id it filed
 * that challenge under.
 *
 * `flow_id` has to come back to `verifySignIn` unchanged - the challenge lives in
 * Redis under it, is consumed on the first verify attempt whether or not that
 * attempt succeeds, and expires on its own if the ceremony is abandoned. Nothing
 * here identifies a user: the assertion carries the credential id, and the API
 * resolves the account from that, so there is no "does this email have a passkey"
 * question asked anywhere in the flow.
 *
 * `options` is spec-shaped JSON straight from the API's `options_to_json()`, which
 * `@simplewebauthn/browser` consumes verbatim - neither side hand-rolls base64url.
 */
export interface PasskeySignInFlow {
  flow_id: string;
  options: PublicKeyCredentialRequestOptionsJSON;
}

/**
 * One passkey on the account, as `GET /user/passkeys` lists it.
 *
 * Deliberately not the whole row: the credential id and public key stay on the
 * server, where they are the credential's identity to the authenticator and would
 * name this account to anyone holding them. What is left is what a diver needs to
 * tell one passkey from another and decide whether to revoke it.
 *
 * `backed_up` is the authenticator's own backup-state flag, refreshed on every
 * assertion - true for a passkey synced through iCloud Keychain or a password
 * manager, false for one bound to a single device or a security key.
 */
export interface Passkey {
  uuid: string;
  name: string;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

/**
 * Passkeys, both halves: the anonymous sign-in ceremony and the authenticated
 * registration and management calls.
 *
 * The two sign-in calls mirror the magic link's request/verify shape. The
 * registration pair is the same two steps inside a session, which is what makes
 * a credential's owner a settled question - it is born attached to the account
 * that made it.
 *
 * The two anonymous calls are cheap to fail: an instance whose API predates
 * passkeys 404s on the first one, and the caller (`hooks/usePasskeySignIn.ts`)
 * treats that as "this instance has no passkeys" rather than as an error worth
 * showing anyone.
 */
export const passkeysAPI = {
  /**
   * Mints a challenge and returns it with the ceremony options to hand to
   * `startAuthentication()`. Called once per armed ceremony - including once per
   * signed-out page view where the browser supports conditional UI, which is what
   * the API's per-IP limit on this route is sized for.
   */
  async requestSignInOptions(): Promise<PasskeySignInFlow> {
    const response = await apiClient.post<PasskeySignInFlow>(
      "/auth/passkey/options",
      {},
    );
    return response.data;
  },

  /**
   * Verifies what the authenticator signed and either signs the caller in or hands
   * back an onboarding session, exactly like the other two entry points - the API
   * funnels all three through the same place.
   *
   * The body is `{flow_id, credential}`, and both names are load-bearing: the API's
   * `PasskeySignInVerifyRequest` is `extra="forbid"`, so a key it doesn't know is a
   * 422 rather than something quietly dropped. `credential` is the spec's own word
   * for the whole `PublicKeyCredential` that `navigator.credentials.get()` returns -
   * the "assertion" is the signature inside it, which is why prose about this
   * ceremony says assertion and the wire says credential.
   *
   * An unknown credential, a deleted account, an expired or already-consumed
   * challenge and a bad signature are one indistinguishable 401, so there is
   * nothing here worth branching on: the caller shows one message for all of them.
   */
  async verifySignIn(
    flowId: string,
    credential: AuthenticationResponseJSON,
  ): Promise<AuthOutcome> {
    const response = await apiClient.post<AuthOutcome>("/auth/passkey/verify", {
      flow_id: flowId,
      credential,
    });
    return captureSession(response.data);
  },

  /**
   * Step 1 of adding a passkey: the creation options for
   * `navigator.credentials.create()`, with the account's existing credentials
   * already excluded so an authenticator that holds one offers to replace it
   * rather than silently making a second.
   *
   * No flow id, unlike sign-in: a registration challenge is keyed by the account
   * that asked for it, which the bearer token already names. One pending
   * registration per account, so two tabs racing both fail - the second tab's
   * options overwrite the challenge the first tab's verify then presents. It
   * self-heals on a retry.
   */
  async requestRegistrationOptions(): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const response = await apiClient.post<{
      options: PublicKeyCredentialCreationOptionsJSON;
    }>("/user/passkey/options", {});
    return response.data.options;
  },

  /**
   * Step 2: hand back what the authenticator attested, plus the label to file it
   * under, and get the stored passkey. The account's inbox is told on the way.
   *
   * `name` is the client's job (see `lib/passkey-name.ts`): only the browser
   * knows what it is running on, and the server just caps the label's length. A
   * 409 means the account is already at its passkey limit, or that this exact
   * credential is registered here already - both carry a `detail` worth showing,
   * so callers run failures through `getApiErrorMessage`.
   */
  async verifyRegistration(
    credential: RegistrationResponseJSON,
    name: string,
  ): Promise<Passkey> {
    const response = await apiClient.post<Passkey>("/user/passkey/verify", {
      credential,
      name,
    });
    return response.data;
  },

  /** Every passkey on the account, oldest first. Unpaginated - there are at most a handful. */
  async getPasskeys(): Promise<Passkey[]> {
    const response = await apiClient.get<Passkey[]>("/user/passkeys");
    return response.data;
  },

  /**
   * Renames a passkey. The label is the only thing about a credential a diver
   * owns - everything else on it is the authenticator's to report or was fixed at
   * registration - so this is the only update there is.
   */
  async renamePasskey(uuid: string, name: string): Promise<void> {
    await apiClient.patch(`/user/passkey/${uuid}`, { name });
  },

  /**
   * Revokes a passkey, for good: the row is what an assertion looks up, so there
   * is nothing to un-delete and no archived state to fall back to. Removing the
   * last one is allowed - the magic link is always there.
   */
  async deletePasskey(uuid: string): Promise<void> {
    await apiClient.delete(`/user/passkey/${uuid}`);
  },
};
