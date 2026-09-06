import { apiClient } from "./client";

/**
 * Who may create an account on this instance.
 *
 * `open` is what this app did before invitations existed: any address that can
 * prove it owns a mailbox gets an account. `invite` means the operator hands out
 * invitations and the gate refuses everyone else - except the very first account
 * on an empty instance, which is the operator's own and needs no invitation.
 */
export type RegistrationMode = "open" | "invite";

/** What `GET /config` tells an anonymous browser about this instance. */
export interface InstanceConfig {
  registration_mode: RegistrationMode;
  /**
   * Whether the OpenDiving project itself operates this instance - `false` on
   * every self-hosted install, and `true` only where the project runs the copy.
   * Backed by the API's `PROJECT_OPERATED` setting. Its one consumer is the
   * landing hero's request form, which may speak in the project's own voice
   * only where this says so; nothing about which form the hero holds, or what
   * the API accepts, turns on it.
   */
  project_operated: boolean;
}

/**
 * The instance's public configuration, from the API rather than from this
 * container's own environment.
 *
 * Both fields are API truth, and the app has already paid once for keeping a
 * second copy of a server fact in the web's environment: the Google client id is
 * mirrored here, and that mirror is why the web "has no way to learn that the API
 * lacks a secret". A web env var would also make flipping the mode a web restart
 * as well as an API one, since `lib/runtime-config.ts` is memoised for the life
 * of the process - and the install bundle hands the web container a curated list
 * of variables, so it would be a compose change that `docker compose pull` does
 * not deliver to an install that already exists.
 *
 * Anonymous by design, and not a leak: the landing page discloses both anyway,
 * the mode by which form it then shows and the operator by how that form reads.
 */
export const configAPI = {
  /**
   * This instance's public configuration.
   *
   * The API marks the response publicly cacheable for a minute
   * (`ClientCacheMiddleware`), so a mode flip is not visible to a browser that
   * already has one until that minute is up or the page is hard-reloaded. That is
   * intended - the value only changes when the operator restarts the API.
   */
  async getInstanceConfig(): Promise<InstanceConfig> {
    const response = await apiClient.get<InstanceConfig>("/config");
    return response.data;
  },
};
