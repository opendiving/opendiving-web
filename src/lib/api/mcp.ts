import { z } from "zod";
import { apiClient } from "./client";

const connectionSchema = z.object({
  uuid: z.string().uuid(),
  name: z.string(),
  client_id: z.string(),
  scopes: z.array(z.string()),
  created_at: z.string(),
});
const consentSchema = z.object({
  client_id: z.string(),
  name: z.string(),
  redirect_uri: z.string().url(),
  scopes: z.array(z.string()),
});

/** An app connection and the permissions granted to it. */
export type McpConnection = z.infer<typeof connectionSchema>;
/** The validated app identity and requested permissions shown before consent. */
export type McpConsent = z.infer<typeof consentSchema>;

/** Browser-session operations for managing delegated MCP access. */
export const mcpAPI = {
  async getConnections(): Promise<McpConnection[]> {
    const response = await apiClient.get<unknown>("/user/mcp/connections");
    return z.array(connectionSchema).parse(response.data);
  },
  async getConsent(request: string): Promise<McpConsent> {
    const response = await apiClient.get<unknown>("/user/mcp/consent", {
      params: { request },
    });
    return consentSchema.parse(response.data);
  },
  async decideConsent(request: string, scopes: string[]): Promise<string> {
    const response = await apiClient.post<unknown>("/user/mcp/consent", {
      request,
      scopes,
    });
    return z.object({ redirect_uri: z.string().url() }).parse(response.data)
      .redirect_uri;
  },
  async revokeConnection(uuid: string): Promise<void> {
    await apiClient.delete(`/user/mcp/connection/${uuid}`);
  },
};
