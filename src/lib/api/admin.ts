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

/**
 * The superuser-only operator routes: the invite queue, and the two things that
 * can be done to a selection from it.
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
};
