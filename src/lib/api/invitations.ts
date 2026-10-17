import { apiClient, type PaginatedResponse } from "./client";
import { getApiErrorStatus } from "./error";

/**
 * One invitation the caller sent, as `GET /user/invitations` lists it.
 *
 * There is no status field and deliberately so: three nullable timestamps say
 * more than one enum would, and the card has to render the date anyway. Pending
 * is both stamps null; the two are mutually exclusive in practice, because the
 * API refuses to revoke an invitation that has already been accepted.
 *
 * There is also no token here, and none on the wire at all. An invitation typed
 * as an address is an allow-list entry keyed on that address rather than a bearer
 * code: the invitee signs in with the address that was invited, and sign-in
 * already proves they own it, so nothing about it is forwardable. The caller's
 * invite link is the exception, and lives apart from these rows (`InviteLink`).
 *
 * A row made by somebody joining through that link is accepted from birth and
 * carries no address: `email` is null and `member_name` is the name on the
 * account it admitted, or null once nothing can say whose that is. The caller
 * never typed that address and was never given it, so it never reaches them.
 */
export interface Invitation {
  uuid: string;
  email: string | null;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  from_invite_link: boolean;
  member_name: string | null;
}

/**
 * The caller's own invite link - one per account, standing until it is reset or
 * removed. Unlike a typed invitation it is a bearer token: whoever follows
 * `/join?via=<token>` may create an account here, counted as the caller's
 * invitation and within the same allowance. The API keeps it readable so this
 * card can show the same link on every visit; the browser keeps nothing.
 */
export interface InviteLink {
  token: string;
  created_at: string;
}

/** `DELETE /user/invite-link`'s answer. */
export interface InviteLinkRemoved {
  message: string;
}

/** `POST /invite-requests`' answer - the same sentence for every address. */
export interface InviteRequestAccepted {
  message: string;
}

/** `DELETE /user/invitation/{uuid}`'s answer. */
export interface InvitationRevoked {
  message: string;
}

/**
 * Asking for an invitation, and the invitations the caller has sent.
 *
 * The first call is anonymous and the rest need a session. They share a module
 * because they are halves of one feature, and because an instance in `open` mode
 * switches them all off the same way: every signed-in route answers 404, which is
 * what lets `InvitationsCard` remove itself with no knowledge of the mode.
 */
export const invitationsAPI = {
  /**
   * Asks whoever runs this instance for an invitation.
   *
   * Anonymous, and answers 202 with one frozen message for every address - a
   * first request, a repeat, an address that already has an account and an
   * address invited last week are indistinguishable from out here. The API never
   * queries the user table on this path at all, so the guarantee is structural
   * rather than a matter of shaping the response; the caller must not try to
   * improve on it by showing different states.
   *
   * 404 on an `open`-mode instance, where there is nothing to ask for.
   */
  async requestInvite(email: string): Promise<InviteRequestAccepted> {
    const response = await apiClient.post<InviteRequestAccepted>(
      "/invite-requests",
      { email },
    );
    return response.data;
  },

  /**
   * The caller's own invitations, newest first.
   *
   * Paginated, unlike the sessions and passkeys lists beside it in the settings
   * grid: those are bounded by a cap the API enforces, while this collection only
   * grows.
   *
   * 404 on an `open`-mode instance - `InvitationsCard` reads that as "this copy
   * of OpenDiving has no invitations feature" and removes itself, the same shape
   * `sessionsAPI` and `passkeysAPI` have.
   */
  async getInvitations(
    page: number = 1,
    items_per_page: number = 20,
  ): Promise<PaginatedResponse<Invitation>> {
    const response = await apiClient.get<PaginatedResponse<Invitation>>(
      "/user/invitations",
      { params: { page, items_per_page } },
    );
    return response.data;
  },

  /**
   * Invites an address, and returns the row it created.
   *
   * The created row comes back rather than a bare 201, which is what lets the
   * card show the new invitation without re-reading the list.
   *
   * Four refusals a caller can meet, each with a message worth showing verbatim:
   * **409** when the address already has an account here, **409** when this
   * caller has already invited it and that invitation is still live, **429** from
   * either the invitation quota or the per-caller attempt throttle that bounds
   * the first 409 from being walked through a wordlist, and **422** for an
   * address that is not an address. The 429s carry different messages and the
   * caller cannot tell which it got, which is fine - both say to wait.
   */
  async sendInvitation(email: string): Promise<Invitation> {
    const response = await apiClient.post<Invitation>("/user/invitations", {
      email,
    });
    return response.data;
  },

  /**
   * Withdraws an invitation that has not been accepted.
   *
   * The row is stamped rather than deleted, so it stays in the list as revoked
   * and keeps counting against the quota - the quota bounds invitations made, by
   * address or through the invite link, and this one was. A second revoke of the
   * same invitation changes nothing.
   *
   * 404 for a uuid belonging to somebody else or to nothing, and **409 for an
   * invitation already accepted**: the account exists by then, and withdrawing
   * the invitation would not unmake it. The card offers the control only on
   * pending rows, so that 409 is a backstop rather than a route a diver takes.
   */
  async revokeInvitation(uuid: string): Promise<InvitationRevoked> {
    const response = await apiClient.delete<InvitationRevoked>(
      `/user/invitation/${uuid}`,
    );
    return response.data;
  },

  /**
   * The caller's invite link, or `null` when they have not made one.
   *
   * The route's 404 means "no link" here and nothing else, though an `open`-mode
   * instance answers 404 too: the card asks only once its list has loaded, by
   * which point an `open` instance has already removed it.
   */
  async getInviteLink(): Promise<InviteLink | null> {
    try {
      const response = await apiClient.get<InviteLink>("/user/invite-link");
      return response.data;
    } catch (error) {
      const status = getApiErrorStatus(error);
      if (status === 404) return null;
      throw error;
    }
  },

  /**
   * Makes the caller's invite link, or replaces its token if there is one - the
   * old address stops admitting anyone, and stops resolving, at once. One route
   * for both, so a double click makes one link rather than a conflict.
   */
  async createInviteLink(): Promise<InviteLink> {
    const response = await apiClient.post<InviteLink>("/user/invite-link");
    return response.data;
  },

  /**
   * Removes the caller's invite link. A 200 whether or not there was one; the rows
   * of people who already joined through it stay on the card.
   */
  async removeInviteLink(): Promise<InviteLinkRemoved> {
    const response =
      await apiClient.delete<InviteLinkRemoved>("/user/invite-link");
    return response.data;
  },
};
