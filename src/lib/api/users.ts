import { apiClient, clearAccessToken } from "./client";

/**
 * What `DELETE /user` hands back: the date the account and everything in it stop
 * being recoverable.
 *
 * `purge_after` is an ISO datetime in UTC, `deleted_at` plus the instance's
 * `ACCOUNT_DELETION_GRACE_DAYS`. It is the only place the browser ever learns that
 * date - the account goes dark in the same instant, so there is no signed-in screen
 * left to read it off later, and nothing to poll. Carry it to `/goodbye` and show it.
 *
 * An instance with a zero grace period answers with a date that is already past: the
 * next sweep takes the account, and the copy has to say so rather than offer a window
 * that has closed.
 */
export interface AccountDeletionResult {
  message: string;
  purge_after: string;
}

/**
 * The signed-in caller's own account. One call so far, and it is the last one a
 * session ever makes.
 */
export const usersAPI = {
  /**
   * Deletes the caller's own account, reversibly until `purge_after`.
   *
   * The server flags the row, blacklists the access and refresh tokens it was called
   * with and clears the refresh cookie, so the session is over the moment this
   * resolves - every subsequent read 401s and the refresh cookie no longer rotates.
   * Dropping the in-memory token here is what stops the client from pretending
   * otherwise: `clearAccessToken` also flushes the in-flight GET map, so nothing
   * issued as the deleted session can resolve into the page that comes next.
   *
   * Only on success, unlike the blacklisting: a rejected call (rate limited, offline)
   * changed nothing server-side, and clearing the token would sign a diver out of an
   * account they still have.
   */
  async deleteAccount(): Promise<AccountDeletionResult> {
    const response = await apiClient.delete<AccountDeletionResult>("/user");
    clearAccessToken();
    return response.data;
  },
};
