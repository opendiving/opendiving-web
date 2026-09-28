import { apiClient, PaginatedResponse } from "./client";

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
 * The superuser-only operator routes: the invite queue, the two things that can
 * be done to a selection from it, and the daily totals.
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
};
