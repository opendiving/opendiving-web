import { apiClient } from "./client";

/**
 * A closed vocabulary shared with the API's `ContactCategory` (see
 * `schemas/contact.py`) - the backend rejects anything else, and the label it puts in
 * the subject line of the forwarded email is derived from the slug there, not here.
 * Every option maps to something this app actually does; don't add one for a channel
 * that doesn't exist.
 */
export const CONTACT_CATEGORIES = [
  "support",
  "bug",
  "feature",
  "import",
  "account",
  "privacy",
  "security",
  "other",
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

/** Human-readable category names for the contact form's picker. */
export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  support: "Help using OpenDiving",
  bug: "Bug report",
  feature: "Feature request",
  import: "Dive-computer import",
  account: "Account & data",
  privacy: "Privacy",
  security: "Security",
  other: "Other",
};

export interface ContactMessage {
  name: string;
  email: string;
  category: ContactCategory;
  subject: string;
  message: string;
}

/**
 * Contact-form submission. Rate-limited server-side, so a rejected send is a 429 the
 * caller should surface rather than retry.
 */
export const contactAPI = {
  // Forwards a contact-form submission to whoever runs this instance. Unauthenticated
  // on both sides - someone who can't sign in is exactly the person who needs it - and
  // rate-limited server-side by email and by IP.
  async sendMessage(message: ContactMessage): Promise<{ message: string }> {
    const response = await apiClient.post("/contact", message);
    return response.data;
  },
};
