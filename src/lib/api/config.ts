import { apiClient } from "./client";
import { getApiErrorStatus } from "./error";

/**
 * Who may create an account on this instance.
 *
 * `open` is what this app did before invitations existed: any address that can
 * prove it owns a mailbox gets an account. `invite` means the operator hands out
 * invitations and the gate refuses everyone else - except whoever follows one of
 * the instance's join links or a member's invite link, and the very first account
 * on an empty instance, which is the operator's own and needs no invitation.
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
  /**
   * Whether this instance fetches dives' surface conditions from a weather
   * service. `/privacy` reads it from the server, to disclose that service only
   * where it is asked.
   */
  dive_conditions: boolean;
}

/** One live join link: the slug its address carries, and the name it is shown by. */
export interface JoinChannel {
  slug: string;
  label: string;
}

/** A live member's invite link, as `/join` resolved it: who it says invited you. */
export interface InviteLinkDoor {
  token: string;
  inviterName: string;
}

/**
 * The shape the API accepts for a `via` - a join-link slug or a member's
 * invite-link token, which is 32 lowercase hex characters and so fits it too - in
 * both resolve routes and on both sign-in doors. A value outside it can name
 * neither, so it is answered here without a request - and never sent, where the
 * API would answer `422`.
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
 * is there, `map_tiles` by whether a card shows a map at all and `dive_conditions`
 * by whether a dive page credits a weather service.
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
      const status = getApiErrorStatus(error);
      if (status === 404) return null;
      throw error;
    }
  },

  /**
   * The member a live invite link names, or `null` for every token that is not
   * one - unknown, reset, removed, a deleted owner, or an `open`-mode instance,
   * which all answer the same 404. Anonymous, one token per request, and never
   * cached: the API marks both answers `private, no-store` so that a Reset stops
   * the old link resolving at the very next request.
   *
   * `/join` asks this before `getJoinChannel`, never after: that route's answers
   * are publicly cacheable, and a live bearer token must not be the first thing
   * sent to it.
   */
  async getInviteLink(token: string): Promise<InviteLinkDoor | null> {
    if (!JOIN_CHANNEL_SLUG.test(token)) return null;
    try {
      const response = await apiClient.get<{ inviter_name: string }>(
        `/invite-link/${token}`,
      );
      return { token, inviterName: response.data.inviter_name };
    } catch (error) {
      const status = getApiErrorStatus(error);
      if (status === 404) return null;
      throw error;
    }
  },
};
