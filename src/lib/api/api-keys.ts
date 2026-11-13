import { apiClient, type MessageResponse } from "./client";

import { z } from "zod";

const permissionMode = z.discriminatedUnion("scope", [
  z.object({ scope: z.enum(["read", "write"]), scopes: z.null().optional() }),
  z.object({ scope: z.literal("scoped"), scopes: z.array(z.string()).min(1) }),
]);
const keySchema = z
  .object({
    uuid: z.string(),
    name: z.string(),
    prefix: z.string(),
    created_at: z.string(),
    last_used_at: z.string().nullable(),
    expires_at: z.string().nullable(),
  })
  .and(permissionMode);
const lifetimeSchema = z.enum(["30d", "90d", "1y", "never"]);

/** A key's access mode and selected content permissions. */
export type ApiKeyScope = z.infer<typeof permissionMode>["scope"];
/** How long a key lasts. The server computes its expiry date. */
export type ApiKeyLifetime = z.infer<typeof lifetimeSchema>;
/** A listed key, without its secret. */
export type ApiKey = z.infer<typeof keySchema>;
/** Creation accepts explicit permissions or legacy read/write access. */
export type ApiKeyCreate = { name: string; lifetime: ApiKeyLifetime } & z.infer<
  typeof permissionMode
>;
/** The secret appears only in the creation response. */
export type ApiKeyCreated = ApiKey & { secret: string };

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
  /** Permissions supported by this instance, shared with MCP authorization. */
  async getPermissions(): Promise<string[]> {
    const response = await apiClient.get<unknown>("/user/api-key-permissions");
    return z.array(z.string()).min(1).parse(response.data);
  },
  /** Every key on the account, oldest first, expired ones included. Unpaginated. */
  async getApiKeys(): Promise<ApiKey[]> {
    const response = await apiClient.get<unknown>("/user/api-keys");
    return z.array(keySchema).parse(response.data);
  },

  /**
   * Makes a key. 409 at the account's cap and 429 past the creation limit, each
   * with a sentence of the API's own worth showing as it is.
   */
  async createApiKey(body: ApiKeyCreate): Promise<ApiKeyCreated> {
    const response = await apiClient.post<unknown>("/user/api-keys", body);
    return keySchema.and(z.object({ secret: z.string() })).parse(response.data);
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
