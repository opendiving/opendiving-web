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
}

/**
 * The instance's public configuration, from the API rather than from this
 * container's own environment.
 *
 * The mode is API truth, and the app has already paid once for keeping a second
 * copy of a server fact in the web's environment: the Google client id is
 * mirrored here, and that mirror is why the web "has no way to learn that the API
 * lacks a secret". A web env var would also make flipping the mode a web restart
 * as well as an API one, since `lib/runtime-config.ts` is memoised for the life
 * of the process - and the install bundle hands the web container a curated list
 * of variables, so it would be a compose change that `docker compose pull` does
 * not deliver to an install that already exists.
 *
 * Anonymous by design, and not a leak: the landing page discloses the mode anyway
 * by which form it then shows.
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
