import { apiClient } from "./client";

/**
 * A closed vocabulary shared with the API's `SupportCategory` (see
 * `schemas/support.py`) - the backend rejects anything else, and the label it puts in
 * the subject line of the forwarded email is derived from the slug there, not here.
 * Every option maps to something this app actually does; don't add one for a channel
 * that doesn't exist.
 */
export const SUPPORT_CATEGORIES = [
  "support",
  "bug",
  "feature",
  "import",
  "account",
  "privacy",
  "security",
  "other",
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

/** Human-readable category names for the support form's picker. */
export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  support: "Help using OpenDiving",
  bug: "Bug report",
  feature: "Feature request",
  import: "Dive-computer import",
  account: "Account & data",
  privacy: "Privacy",
  security: "Security",
  other: "Other",
};

export interface SupportRequest {
  name: string;
  email: string;
  category: SupportCategory;
  subject: string;
  message: string;
}

/**
 * Support-form submission. Rate-limited server-side, so a rejected send is a 429 the
 * caller should surface rather than retry.
 */
export const supportAPI = {
  // Forwards a support request to whoever runs this instance. Unauthenticated on both
  // sides - someone who can't sign in is exactly the person who needs it - and
  // rate-limited server-side by email and by IP.
  async sendRequest(request: SupportRequest): Promise<{ message: string }> {
    const response = await apiClient.post("/support", request);
    return response.data;
  },
};
