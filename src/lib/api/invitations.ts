import { apiClient } from "./client";

/** `POST /invite-requests`' answer - the same sentence for every address. */
export interface InviteRequestAccepted {
  message: string;
}

/** Asking whoever runs an invite-only instance for an invitation. */
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
};
