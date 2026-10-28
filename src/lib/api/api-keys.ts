import { apiClient, type MessageResponse } from "./client";

/** What a key may do: `read` is the safe methods only, `write` is what a browser can. */
export type ApiKeyScope = "read" | "write";

/** How long a key lasts, chosen at creation; the API turns it into `expires_at`. */
export type ApiKeyLifetime = "30d" | "90d" | "1y" | "never";

/** One of the account's API keys, as `GET /user/api-keys` lists it. */
export interface ApiKey {
  uuid: string;
  /** The label the diver typed when making it. Not unique. */
  name: string;
  /**
   * The secret's first twelve characters, `odk_` and eight more, kept in clear so a
   * row can name a key nobody here holds any longer. Not enough to use it.
   */
  prefix: string;
  scope: ApiKeyScope;
  created_at: string;
  /**
   * Null for a key that has never been used. Stamped at most every few minutes,
   * so it is accurate to the day the card shows rather than to the second.
   */
  last_used_at: string | null;
  /**
   * Null for a key that never expires. An expired key stays listed until it is
   * revoked, and counts toward the cap until then.
   */
  expires_at: string | null;
}

/** What the create form sends. A lifetime rather than a date: the server computes it. */
export interface ApiKeyCreate {
  name: string;
  scope: ApiKeyScope;
  lifetime: ApiKeyLifetime;
}

/** `POST /user/api-keys`'s answer: the one response that ever carries the secret. */
export interface ApiKeyCreated extends ApiKey {
  /**
   * The whole key, `odk_` and 43 more characters. Only a fingerprint of it is
   * kept, so nothing can show it again - hold it in component state and nowhere
   * else.
   */
  secret: string;
}

/**
 * The account's API keys, for tools of the diver's own, and the two things done
 * with them here: make one and revoke one. There is no rename; revoking and making
 * another is also how a key is rotated.
 *
 * Every one of these routes refuses an API key itself, so they only ever go out on
 * the browser's own sign-in. An instance whose API predates keys 404s on the list,
 * which `ApiKeysCard` reads as a feature this copy does not have.
 */
export const apiKeysAPI = {
  /** Every key on the account, oldest first, expired ones included. Unpaginated. */
  async getApiKeys(): Promise<ApiKey[]> {
    const response = await apiClient.get<ApiKey[]>("/user/api-keys");
    return response.data;
  },

  /**
   * Makes a key. 409 at the account's cap and 429 past the creation limit, each
   * with a sentence of the API's own worth showing as it is.
   */
  async createApiKey(body: ApiKeyCreate): Promise<ApiKeyCreated> {
    const response = await apiClient.post<ApiKeyCreated>(
      "/user/api-keys",
      body,
    );
    return response.data;
  },

  /**
   * Revokes a key by deleting it, so its next request is refused. 404 for a key
   * that is someone else's or already gone.
   */
  async revokeApiKey(uuid: string): Promise<MessageResponse> {
    const response = await apiClient.delete<MessageResponse>(
      `/user/api-key/${uuid}`,
    );
    return response.data;
  },
};
