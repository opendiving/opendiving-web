import { apiClient, PaginatedResponse } from "./client";
import type { Species } from "./species";

/**
 * One row of the operator's invite queue, as `GET /admin/invite-requests` lists it.
 *
 * Every row is pending. A request that has been invited, declined or swept is
 * gone rather than flagged, so there is no status field to read and no filter to
 * pass - which is also why the list is ordered by `created_at` alone.
 *
 * There is no uuid either: the address is the only identifier a request has, and
 * it is what both actions below are keyed on.
 *
 * `has_account` is resolved server-side against the lowercased account address.
 * The anonymous endpoint that files a request structurally may not consult the
 * user table, so an address that already has an account is stored like any
 * other; this flag is how the operator spots one and removes it instead of
 * inviting somebody who is already here.
 */
export interface AdminInviteRequest {
  email: string;
  created_at: string;
  has_account: boolean;
}

/**
 * What became of one address in a batch of invitations.
 *
 * `mail_failed` is the one that needs reading carefully: the invitation row was
 * committed and the address *is* admitted - only the email did not go - so the
 * operator's job there is to tell the person another way, not to invite them
 * again.
 */
export type InvitationOutcome =
  "invited" | "already_registered" | "already_invited" | "mail_failed";

/** One address's result from `POST /admin/invitations`. */
export interface AdminInvitationOutcome {
  email: string;
  outcome: InvitationOutcome;
}

/**
 * `POST /admin/invitations`' answer: one entry per address that was sent, in the
 * order they were sent.
 *
 * A per-address report rather than a 5xx on the first problem, so a partial mail
 * failure is visible as *which* addresses got through. A caller that reports
 * "n invited" from the length of its own request is therefore reporting
 * something the API never said.
 */
export interface AdminInvitationBatchResponse {
  results: AdminInvitationOutcome[];
}

/**
 * `DELETE /admin/invite-requests`' answer. The count is what actually went,
 * which can be fewer than were asked for - the retention sweep or somebody
 * else's invitation may have taken a row between the queue being read and being
 * acted on.
 */
export interface InviteRequestsRemoved {
  removed: number;
}

/** A configured join channel, as the stats route lists it for the legend. */
export interface AdminStatsChannel {
  slug: string;
  label: string;
}

/**
 * One UTC day of `GET /admin/stats`.
 *
 * `accounts_created` is keyed by the door an account came through: a channel
 * slug, or one of the fixed words `invitation`, `waitlist`, `open` and
 * `bootstrap`. Only a source that created an account that day has a key, so a
 * missing key is a zero. A slug may be one no longer configured, since a
 * retired channel keeps its history.
 */
export interface AdminStatsDay {
  day: string;
  accounts_created: Record<string, number>;
  sign_ins: number;
  active_accounts: number;
}

/**
 * Two figures as of the request rather than of any day: every account, and the
 * accounts holding a session that can still authenticate.
 */
export interface AdminStatsTotals {
  accounts: number;
  active_now: number;
}

/**
 * `GET /admin/stats`' answer: every day from `from` to `to` inclusive,
 * zero-filled, so a chart needs no gap logic of its own.
 */
export interface AdminStats {
  from: string;
  to: string;
  channels: AdminStatsChannel[];
  days: AdminStatsDay[];
  totals: AdminStatsTotals;
}

/**
 * The narrowest stored photo the API's selection rule keeps, in pixels: the width
 * of the thumbnail it asks Commons for. Mirrors `COMMONS_THUMBNAIL_WIDTH`, which
 * the API publishes nowhere; only a pin holds a photo narrower than this.
 */
export const SPECIES_PHOTO_FLOOR = 500;

/**
 * What an operator decided about a species' photo. `null` is the rule deciding,
 * and is the only state a re-fetch leaves behind.
 */
export type SpeciesPhotoCuration = "hidden" | "pinned";

/**
 * The catalog page's chips, as `GET /admin/species` takes them in `filter`.
 * `narrow` is a stored photo under `SPECIES_PHOTO_FLOOR`.
 */
export type AdminSpeciesFilter =
  "with_photo" | "without_photo" | "hidden" | "pinned" | "narrow";

/**
 * A catalog row as the admin routes return it: the public record plus what an
 * operator curating its photo needs. `photo_width` and `photo_height` are the
 * stored bytes' size, absent for a photo kept before they were measured.
 */
export interface AdminSpecies extends Species {
  photo_fetched_at: string | null;
  photo_curation: SpeciesPhotoCuration | null;
  photo_width: number | null;
  photo_height: number | null;
}

/**
 * One Commons file the photo picker offers. `width` and `height` are the
 * original's. `preview` is a `data:` URI the API fetched on the page's behalf -
 * `img-src` admits no Wikimedia host - and `null` when those bytes did not
 * arrive; the file can still be pinned.
 */
export interface AdminSpeciesPhotoCandidate {
  file: string;
  width: number | null;
  height: number | null;
  license: string | null;
  author: string | null;
  source_url: string | null;
  preview: string | null;
  is_current: boolean;
}

/** `GET /admin/species/{uuid}/photo-candidates`' answer. */
export interface AdminSpeciesPhotoCandidates {
  category: string | null;
  candidates: AdminSpeciesPhotoCandidate[];
}

/**
 * The superuser-only operator routes: the invite queue, the two things that can
 * be done to a selection from it, the daily totals, and the species catalog's
 * photos.
 *
 * Every one of these answers `401` signed out and `403` for a signed-in account
 * that is not a superuser - the API's gate is the one that counts, and the
 * `/admin` section's own gate is a convenience over it rather than a substitute.
 *
 * The two batch routes take addresses rather than row ids, so an address that
 * never asked can be invited through the same call; the API caps how many go in
 * one request at a hundred, and rejects an oversized batch with a 422 rather
 * than sending part of it. The queue page holds its selection to that cap - see
 * `MAX_SELECTED` there, and the note on why the number has to be written down.
 */
export const adminAPI = {
  /**
   * One page of pending invite requests, newest first.
   *
   * Paginated because the queue is unbounded over time - an instance whose
   * landing page has been up for a while can have more rows than a screen.
   */
  async listInviteRequests(
    page: number = 1,
    items_per_page: number = 10,
  ): Promise<PaginatedResponse<AdminInviteRequest>> {
    const response = await apiClient.get<PaginatedResponse<AdminInviteRequest>>(
      "/admin/invite-requests",
      { params: { page, items_per_page } },
    );
    return response.data;
  },

  /**
   * Invites a batch of addresses from the calling superuser, and reports what
   * happened to each one.
   *
   * Inviting an address also clears its request row, so the queue shrinks by
   * whatever this call actually invited - the caller refetches rather than
   * removing rows locally, since `already_registered` and `already_invited`
   * leave their rows in place.
   */
  async sendInvitations(
    emails: string[],
  ): Promise<AdminInvitationBatchResponse> {
    const response = await apiClient.post<AdminInvitationBatchResponse>(
      "/admin/invitations",
      { emails },
    );
    return response.data;
  },

  /**
   * Drops addresses from the queue - spam, or a request the operator declines.
   *
   * Nothing is written anywhere else and nobody is told: the person may ask
   * again, and the rate limits on the public request form are what bound that.
   *
   * Body-keyed rather than a per-row URL, because a request row has no public
   * identifier. Axios sends a body on `DELETE` only through `data`.
   */
  async removeInviteRequests(emails: string[]): Promise<InviteRequestsRemoved> {
    const response = await apiClient.delete<InviteRequestsRemoved>(
      "/admin/invite-requests",
      { data: { emails } },
    );
    return response.data;
  },

  /**
   * The daily totals for every UTC day from `from` to `to`, both inclusive and
   * written `YYYY-MM-DD`.
   *
   * The API refuses a range that runs backwards or is longer than 92 days with a
   * 422; the stats page asks for one calendar month at a time, which is always
   * inside it.
   */
  async getStats(from: string, to: string): Promise<AdminStats> {
    const response = await apiClient.get<AdminStats>("/admin/stats", {
      params: { from, to },
    });
    return response.data;
  },
  /**
   * One page of the species catalog, newest first. `search` matches any name the
   * species goes by; `filter` is one chip. Both are left off the request when
   * unset, since the API reads an empty `filter` as a 422.
   */
  async listSpecies(
    page: number = 1,
    items_per_page: number = 10,
    { search, filter }: { search?: string; filter?: AdminSpeciesFilter } = {},
  ): Promise<PaginatedResponse<AdminSpecies>> {
    const response = await apiClient.get<PaginatedResponse<AdminSpecies>>(
      "/admin/species",
      {
        params: {
          page,
          items_per_page,
          ...(search ? { search } : {}),
          ...(filter ? { filter } : {}),
        },
      },
    );
    return response.data;
  },

  /** The Commons files the operator may pin for one species, previews inline. */
  async speciesPhotoCandidates(
    uuid: string,
  ): Promise<AdminSpeciesPhotoCandidates> {
    const response = await apiClient.get<AdminSpeciesPhotoCandidates>(
      `/admin/species/${encodeURIComponent(uuid)}/photo-candidates`,
    );
    return response.data;
  },

  /**
   * Pins a Commons file - a title, with or without `File:`, or its file-page URL
   * - as the species' photo. `422` names input that is no file, a missing file
   * or bytes that will not decode; `503` means Commons was not reached and the
   * row is unchanged.
   */
  async pinSpeciesPhoto(uuid: string, file: string): Promise<AdminSpecies> {
    const response = await apiClient.put<AdminSpecies>(
      `/admin/species/${encodeURIComponent(uuid)}/photo`,
      { file },
    );
    return response.data;
  },

  /** Clears the species' photo and keeps the rule from putting one back. */
  async hideSpeciesPhoto(uuid: string): Promise<AdminSpecies> {
    const response = await apiClient.delete<AdminSpecies>(
      `/admin/species/${encodeURIComponent(uuid)}/photo`,
    );
    return response.data;
  },

  /**
   * Asks the selection rule again and hands the row back to it: a pin or a hide
   * is dropped, and a rule that declines clears the photo. `503`, row unchanged,
   * when the rule could not be asked. Slow - a resolve's budgets.
   */
  async refetchSpeciesPhoto(uuid: string): Promise<AdminSpecies> {
    const response = await apiClient.post<AdminSpecies>(
      `/admin/species/${encodeURIComponent(uuid)}/photo/refetch`,
    );
    return response.data;
  },
};
