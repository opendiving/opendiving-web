import { apiClient, fetchAllPages, lookupFetcher } from "./client";
import { labelOrFallback } from "./labels";
import type {
  MessageResponse,
  PaginatedResponse,
  SearchFilters,
} from "./client";

/**
 * What a contact is to the diver. Mirrors the API's `ContactRole`, value for value
 * and in its order, which is the order the API stores a set in and the order the
 * dialog offers them. Keep in sync with the API.
 *
 * A set rather than a type: a resort is `dive_center` + `accommodation`, a school
 * that sells gear is `school` + `shop`, and there is no `resort` value for exactly
 * that reason. `other` stops a forced lie - an aquarium, a navy school.
 */
export const CONTACT_ROLES = [
  "dive_center",
  "school",
  "shop",
  "accommodation",
  "liveaboard",
  "club",
  "other",
] as const;

export type ContactRole = (typeof CONTACT_ROLES)[number];

/** Display labels for `CONTACT_ROLES`, in the dialog's wording. */
export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  dive_center: "Dive center",
  school: "School",
  shop: "Shop",
  accommodation: "Accommodation",
  liveaboard: "Liveaboard",
  club: "Club",
  other: "Other",
};

/**
 * A role's display name. The API reads its roles back as plain strings, so one
 * this build has never heard of falls back as `labelOrFallback` says.
 */
export function contactRoleLabel(role: string): string {
  return labelOrFallback(CONTACT_ROLE_LABELS, role);
}

/**
 * A postal address. `country` is the one member it cannot go without, in the
 * API as in DiveJSON and UDDF: an address with no country is no anchor.
 */
export interface ContactAddress {
  street?: string | null;
  city?: string | null;
  postcode?: string | null;
  region?: string | null;
  country: string;
}

/**
 * A party the diver dealt with - a dive center, a school, a shop, the place they
 * stayed - kept once and picked from a list wherever a dive, a course, a
 * certification, a gear service or a trip part names it.
 */
export interface Contact {
  uuid: string;
  name: string;
  // Plain strings rather than `ContactRole`: the API reads a stored vocabulary back
  // as the string it is, so a newer value arrives here before this build knows it.
  roles: string[];
  phone?: string | null;
  email?: string | null;
  // Always an absolute http(s) URL - the API refuses a bare host, and the dialog
  // prepends the scheme before sending one.
  website?: string | null;
  address?: ContactAddress | null;
  notes: string;
  user_uuid: string;
  created_at: string;
}

export interface ContactCreate {
  name: string;
  // Strings for the reason `Contact.roles` is: an edit sends back a role this build
  // has no checkbox for rather than dropping it. The API validates the set.
  roles?: string[];
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: ContactAddress | null;
  notes?: string;
}

/**
 * The `PATCH /contact/{uuid}` body. An explicit `null` clears the phone, the
 * email, the website or the address, and naming `address` replaces it whole;
 * `name`, `roles` and `notes` take no null.
 */
export type ContactUpdate = Partial<ContactCreate>;

/** One row of `GET /contacts/lookup`: the name, and the address the picker's hint reads. */
export interface ContactLookupItem {
  uuid: string;
  name: string;
  address?: ContactAddress | null;
}

/** Contact CRUD. Every call is scoped to the signed-in user by the API. */
export const contactsAPI = {
  /**
   * Create a contact. Names are unique per diver, compared case-insensitively, so
   * a second "Blue Ocean" is a 422 whose message `getApiErrorMessage` reads out.
   */
  async createContact(data: ContactCreate): Promise<Contact> {
    const response = await apiClient.post<Contact>(`/contact`, data);
    return response.data;
  },

  /**
   * A page of the diver's contacts, by name. `search` narrows server-side to
   * contacts whose name or city contains it, case-insensitively - the API caps
   * `items_per_page` at 100, so this is a page of matches, never the whole set.
   */
  async getContacts(
    page: number = 1,
    items_per_page: number = 10,
    { search }: SearchFilters = {},
  ): Promise<PaginatedResponse<Contact>> {
    const response = await apiClient.get<PaginatedResponse<Contact>>(
      `/contacts`,
      {
        params: {
          page,
          items_per_page,
          ...(search ? { search } : {}),
        },
      },
    );
    return response.data;
  },

  /**
   * A page of the diver's contacts as a picker lists them, the one a dive at or
   * before `until` last named first, then contacts no such dive names, newest
   * first. `search` matches what `getContacts` matches.
   */
  lookupContacts: lookupFetcher<ContactLookupItem>(`/contacts/lookup`),

  /** One contact by uuid. */
  async getContact(contactUuid: string): Promise<Contact> {
    const response = await apiClient.get<Contact>(`/contact/${contactUuid}`);
    return response.data;
  },

  /** Update a contact. The API answers with a status message, not the contact. */
  async updateContact(
    contactUuid: string,
    data: ContactUpdate,
  ): Promise<MessageResponse> {
    const response = await apiClient.patch<MessageResponse>(
      `/contact/${contactUuid}`,
      data,
    );
    return response.data;
  },

  /**
   * Delete a contact. Everything that named it - dives, courses, certifications,
   * service records, trip parts - survives with the link gone, so there is no
   * reassign option to pass. A second delete on the same uuid is a 404.
   */
  async deleteContact(contactUuid: string): Promise<MessageResponse> {
    const response = await apiClient.delete<MessageResponse>(
      `/contact/${contactUuid}`,
    );
    return response.data;
  },
};

/**
 * Every contact the diver has, for a surface that names several at once - a
 * diver keeps tens, so this is one request for anyone realistic, where a lookup
 * per uuid would be one per name on screen.
 */
export async function fetchAllContacts(
  signal?: AbortSignal,
): Promise<Contact[]> {
  return fetchAllPages(
    (page, itemsPerPage) => contactsAPI.getContacts(page, itemsPerPage),
    { signal, label: "contacts", keyOf: (contact) => contact.uuid },
  );
}
