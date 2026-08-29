import { apiClient } from "./client";

/**
 * One device signed in to the account, as `GET /user/sessions` lists it.
 *
 * `user_agent` is the **raw** header string the API saw when this session was
 * created, not a label - `lib/passkey-name.ts`'s `deviceNameForUserAgent` turns
 * it into "Chrome on macOS" here, which is what keeps a session row and a passkey
 * row from calling the same browser two different things. It is the empty string
 * where the client sent no header at all.
 *
 * There is deliberately no expiry field. The window is a sliding one driven by
 * the operator's own refresh-token setting, so a date computed from it would
 * restate a setting as a fact; the privacy page says "about a week" for the same
 * reason. There is no revoked field either, because the list only ever contains
 * live rows.
 *
 * `current` is resolved from the requesting access token rather than from the
 * row, so it is the one field that varies by *credential* rather than by account
 * - which is why this response is never cached anywhere. An access token minted
 * before sessions existed names none, and for its remaining minutes every row
 * comes back `false` rather than one coming back wrongly.
 */
export interface UserSession {
  uuid: string;
  created_at: string;
  last_used_at: string;
  ip: string;
  user_agent: string;
  current: boolean;
}

/**
 * What `DELETE /user/sessions` answers with. The count is the payload rather than
 * decoration: the card confirms before it sends, so the number of devices
 * actually signed out cannot come from the dialog.
 */
export interface SessionsRevoked {
  message: string;
  revoked: number;
}

/**
 * The devices signed in to the account, and the two ways to sign one out.
 *
 * An instance whose API predates server-side sessions 404s on the list, and
 * `SessionsCard` reads that as "this copy of OpenDiving has no sessions feature"
 * rather than as an error worth showing anyone - the same shape `passkeysAPI`
 * has.
 */
export const sessionsAPI = {
  /**
   * Every device currently signed in, most recently used first. Unpaginated -
   * the API caps live sessions per account and lists above that cap, so this can
   * never truncate.
   */
  async listSessions(): Promise<UserSession[]> {
    const response = await apiClient.get<UserSession[]>("/user/sessions");
    return response.data;
  },

  /**
   * Signs one other device out. The row is marked revoked rather than removed, so
   * a second call for the same uuid succeeds and changes nothing.
   *
   * 404 for a uuid belonging to someone else or to nothing, and **409 for the
   * caller's own session** - ending that one is what signing out is, since it
   * also has to clear the refresh cookie. The card marks the current row and
   * offers no revoke control on it, so the 409 is a backstop rather than
   * something a diver should be able to reach.
   *
   * The device it signs out keeps working until its access token expires - an
   * operator setting, half an hour by default: what a revoked session loses is
   * the ability to refresh, not the token it is already holding.
   */
  async revokeSession(uuid: string): Promise<void> {
    await apiClient.delete(`/user/session/${uuid}`);
  },

  /**
   * Signs every *other* device out and reports how many that was. The caller's
   * own session is spared, which is what makes this "sign out other sessions"
   * rather than a global logout.
   */
  async revokeOtherSessions(): Promise<SessionsRevoked> {
    const response = await apiClient.delete<SessionsRevoked>("/user/sessions");
    return response.data;
  },
};
