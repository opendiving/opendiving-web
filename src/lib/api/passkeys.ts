import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
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
 * Passkey sign-in: the anonymous half of WebAuthn.
 *
 * Two calls, mirroring the magic link's request/verify shape. Registering a passkey
 * is a different, authenticated pair of endpoints under `/user` and is not here yet.
 *
 * Both calls are anonymous by design, and both are cheap to fail: an instance whose
 * API predates passkeys 404s on the first one, and the caller
 * (`hooks/usePasskeySignIn.ts`) treats that as "this instance has no passkeys"
 * rather than as an error worth showing anyone.
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
};
