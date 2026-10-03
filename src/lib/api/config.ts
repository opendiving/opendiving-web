import { apiClient } from "./client";

/**
 * Who may create an account on this instance.
 *
 * `open` is what this app did before invitations existed: any address that can
 * prove it owns a mailbox gets an account. `invite` means the operator hands out
 * invitations and the gate refuses everyone else - except whoever follows one of
 * the instance's join links, and the very first account on an empty instance,
 * which is the operator's own and needs no invitation.
 */
export type RegistrationMode = "open" | "invite";

/** What `GET /config` tells an anonymous browser about this instance. */
export interface InstanceConfig {
  registration_mode: RegistrationMode;
  /**
   * Whether the OpenDiving project itself operates this instance - `false` on
   * every self-hosted install, and `true` only where the project runs the copy.
   * Backed by the API's `PROJECT_OPERATED` setting. Two consumers read it, and
   * both use it for the same thing - deciding whether this copy may speak in
   * the project's own voice. The landing hero is one, for its request form and
   * for the line under a join link's heading; the other is
   * `lib/api/config.server.ts`, which asks the API from the server and gates the
   * operator block on `/privacy` and `/terms`. Nothing about which form the hero
   * holds, or what the API accepts, turns on it.
   */
  project_operated: boolean;
  /**
   * Whether this instance has any join link at all - a yes or no, never the list,
   * which is resolved one slug at a time (`getJoinChannel`). `/privacy` and
   * `/terms` show their join-link sentences on it, read from the server by
   * `lib/api/config.server.ts`.
   */
  join_links: boolean;
  /**
   * Whether this instance has a map renderer drawing the map tiles its cards and
   * page heads are composed from. A card or a hero asks for no tile while it is
   * false, and shows the map's water instead; `/privacy` reads it from the
   * server, to say who fetches the basemap for those maps.
   */
  map_tiles: boolean;
}

/** One live join link: the slug its address carries, and the name it is shown by. */
export interface JoinChannel {
  slug: string;
  label: string;
}

/**
 * The shape the API accepts for a join-link slug, in the resolve route and in the
 * `via` it takes on both sign-in doors. A value outside it cannot name a channel,
 * so it is answered here without a request - and never sent, where the API would
 * answer `422`.
 */
export const JOIN_CHANNEL_SLUG = /^[a-z0-9-]{1,32}$/;

/**
 * The instance's public configuration, from the API rather than from this
 * container's own environment.
 *
 * Every field is API truth, and the app has already paid once for keeping a
 * second copy of a server fact in the web's environment: the Google client id is
 * mirrored here, and that mirror is why the web "has no way to learn that the API
 * lacks a secret". A web env var would also make flipping the mode a web restart
 * as well as an API one, since `lib/runtime-config.ts` is memoised for the life
 * of the process - and the install bundle hands the web container a curated list
 * of variables, so it would be a compose change that `docker compose pull` does
 * not deliver to an install that already exists.
 *
 * Anonymous by design, and not a leak: the landing page discloses the first two
 * anyway, the mode by which form it then shows and the operator by how that form
 * reads, and `/privacy` discloses `join_links` by whether its join-link paragraph
 * is there and `map_tiles` by whether a card shows a map at all.
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

  /**
   * The channel a join link names, or `null` when it names none - a slug nobody
   * configured, one since removed, or one no operator could have configured.
   * Anonymous, and one slug per request: the API never lists the channels, so a
   * visitor holding one link learns nothing about the others. Cacheable for a
   * minute like `/config`, so a removed slug can still resolve that long; the API's
   * gate is what refuses it then.
   */
  async getJoinChannel(slug: string): Promise<JoinChannel | null> {
    if (!JOIN_CHANNEL_SLUG.test(slug)) return null;
    try {
      const response = await apiClient.get<JoinChannel>(
        `/join-channel/${slug}`,
      );
      return response.data;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404) return null;
      throw error;
    }
  },
};
