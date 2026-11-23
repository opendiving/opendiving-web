import { apiClient, versionedRequest } from "./client";
import { JOIN_CHANNEL_SLUG } from "./config";
import { getApiErrorStatus } from "./error";

/**
 * The caller's own connect link - one per account, standing until it is reset or
 * removed. Whoever opens `/connect/<token>` sees the caller's picture and name, may
 * put the caller in their people, connected, and on an invite-only instance may
 * create an account through it, counted as the caller's invitation. The API keeps
 * the token readable so People can show the same link on every visit; the browser
 * keeps nothing.
 */
export interface ConnectLink {
  token: string;
  created_at: string;
}

/**
 * Whose link a token is, as anyone holding it is told: the owner's name and the
 * version of their picture, null without one. Never the username, which only a
 * caller with a session is told (`ConnectLinkOwnerForYou`).
 */
export interface ConnectLinkOwner {
  name: string;
  avatar_sha256?: string | null;
}

/** Whose link a token is, as a signed-in caller is told, and where they stand. */
export interface ConnectLinkOwnerForYou extends ConnectLinkOwner {
  username: string;
  // The link is the caller's own.
  is_yours: boolean;
  // The caller's person already connected to the link's owner, or null.
  person_uuid?: string | null;
}

/** `DELETE /user/connect-link`'s answer. */
export interface ConnectLinkRemoved {
  message: string;
}

/** The address a connect link opens, on whichever origin this copy runs. */
export function connectLinkUrl(origin: string, token: string): string {
  return `${origin}/connect/${token}`;
}

// A token is 32 lowercase hex characters, so it fits the `via` shape; a value
// outside that can name no link, and is answered here without a request.
const isTokenShaped = (token: string) => JOIN_CHANNEL_SLUG.test(token);

async function nullOn404<T>(request: Promise<{ data: T }>): Promise<T | null> {
  try {
    return (await request).data;
  } catch (error) {
    if (getApiErrorStatus(error) === 404) return null;
    throw error;
  }
}

/**
 * The connect link: the owner's three routes, and the reads of a token. Every read
 * of a token answers `null` for an unknown, reset or removed one and for an owner
 * who has asked to be deleted, which the API answers with one identical 404 in
 * every registration mode, and none of them is stored by the browser.
 */
export const connectLinksAPI = {
  /**
   * The caller's connect link, or `null` when they have none. An API key is
   * refused here; the web only ever calls it with a session.
   */
  async getOwn(): Promise<ConnectLink | null> {
    return nullOn404(apiClient.get<ConnectLink>("/user/connect-link"));
  },

  /**
   * Makes the caller's connect link, or replaces its token - the old address
   * stops resolving at once, and the people it connected stay connected. One
   * route for both, so a double click makes one link rather than a conflict.
   */
  async create(): Promise<ConnectLink> {
    const response = await apiClient.post<ConnectLink>("/user/connect-link");
    return response.data;
  },

  /** Removes the caller's connect link. A 200 whether or not there was one. */
  async remove(): Promise<ConnectLinkRemoved> {
    const response =
      await apiClient.delete<ConnectLinkRemoved>("/user/connect-link");
    return response.data;
  },

  /**
   * Whose link `token` is, as somebody signed out reads it: the name and the
   * picture's version, never the username.
   */
  async resolve(token: string): Promise<ConnectLinkOwner | null> {
    if (!isTokenShaped(token)) return null;
    return nullOn404(apiClient.get<ConnectLinkOwner>(`/connect-link/${token}`));
  },

  /**
   * Whose link `token` is, as the signed-in caller reads it: the username
   * besides, whether the link is the caller's own, and the caller's person already
   * connected to its owner.
   */
  async resolveForYou(token: string): Promise<ConnectLinkOwnerForYou | null> {
    if (!isTokenShaped(token)) return null;
    return nullOn404(
      apiClient.get<ConnectLinkOwnerForYou>(`/connect-link/${token}/owner`),
    );
  },

  /**
   * The link owner's picture. The token is the credential, so it is read alike
   * signed in or out; `version` is the owner's `avatar_sha256`.
   */
  async getOwnerPictureBlob(token: string, version?: string): Promise<Blob> {
    const response = await apiClient.get<Blob>(
      `/connect-link/${token}/avatar`,
      versionedRequest(version, { responseType: "blob" }),
    );
    return response.data;
  },
};
