import { apiClient } from "./client";

/** `POST /user/download-ticket`'s answer. */
export interface DownloadTicket {
  ticket: string;
  /** Seconds the ticket stays valid. */
  expires_in: number;
}

/** Tickets that authenticate a download the browser fetches by navigating to it. */
export const downloadTicketsAPI = {
  /**
   * Mints a ticket for one download route, as the signed-in session.
   *
   * `path` is the route under the API base with no query string - `/export/archive`,
   * not `/api/v1/export/archive?v=1`. The ticket is good for that path alone, may be
   * presented more than once until it expires, and dies with the session that minted
   * it. Build the URL to navigate to with `ticketedDownloadUrl`.
   */
  async create(path: string): Promise<DownloadTicket> {
    const response = await apiClient.post<DownloadTicket>(
      "/user/download-ticket",
      { path },
    );
    return response.data;
  },
};

/**
 * The absolute-or-relative URL that downloads `path` with `ticket` standing in for
 * the `Authorization` header a navigation cannot send.
 *
 * Built by the API client so it lands on the same base every other call does: the
 * relative `/api/v1` proxy route when same-origin, `NEXT_PUBLIC_API_URL` when split.
 */
export function ticketedDownloadUrl(path: string, ticket: string): string {
  return apiClient.getUri({ url: path, params: { ticket } });
}
