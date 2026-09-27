import { apiClient, fetchAllPages } from "./client";
import type { PaginatedResponse } from "./client";

/**
 * What a person was on one occasion - a dive, a trip, a course. Mirrors the API's
 * `PersonRole`, value for value and in its order, which is the order the role
 * control offers them. Keep in sync with the API.
 *
 * One value per occasion rather than a set: where two apply the more specific
 * wins. There is no `other`, because a reference may carry no role at all, and
 * that already means "was there".
 */
export const PERSON_ROLES = [
  "buddy",
  "guide",
  "instructor",
  "student",
  "companion",
] as const;

export type PersonRole = (typeof PERSON_ROLES)[number];

export const PERSON_ROLE_LABELS: Record<PersonRole, string> = {
  buddy: "Buddy",
  guide: "Guide",
  instructor: "Instructor",
  student: "Student",
  companion: "Companion",
};

/**
 * A role's display name, tolerating one this build has never heard of: the API
 * reads a stored role back as a plain string, so a value added there before this
 * build ships a label renders de-snaked rather than blank.
 */
export function personRoleLabel(role: string): string {
  return (
    PERSON_ROLE_LABELS[role as PersonRole] ??
    role.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

/**
 * One person on a dive, a trip or a course: the uuid and what they were on that
 * occasion, never a summary of the person - the names are read through
 * `usePeopleByUuid`.
 *
 * `role` is a plain string rather than `PersonRole` for the reason
 * `Contact.roles` is: a read carries a stored vocabulary back as the string it
 * is, so a newer value arrives here before this build knows it, and an edit
 * sends it back unchanged rather than dropping it. `null` means "was there".
 */
export interface PersonReference {
  person_uuid: string;
  role: string | null;
}

/**
 * Someone the diver was with - a buddy, a guide, an instructor, a fellow
 * student, the companion who stayed on the boat - kept once and referenced from
 * any number of dives, trips and courses, and from a certification as its
 * instructor.
 */
export interface Person {
  uuid: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes: string;
  // The *current* username of the account on this instance the diver linked
  // this person to, or null when unlinked. Joined on every read, so a rename
  // shows through and a purged account reads null. Nothing else of that account
  // is ever sent.
  username?: string | null;
  // The live dives that name this person - what the dives list's `person_uuid`
  // filter matches, so the People page's count and the person's page agree.
  dive_count: number;
  created_at: string;
  updated_at?: string | null;
}

export interface PersonCreate {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string;
  // The exact username of an account on this instance. A 422 on this one field
  // when no account has it, when it is the diver's own, or when another of their
  // people already links it - see `getApiFieldError`.
  username?: string | null;
}

// The `PATCH /person/{uuid}` body. An explicit `null` clears the email or the
// phone, and `null` for `username` unlinks the person; `name` and `notes` take no
// null. Omitting a key leaves it alone.
export type PersonUpdate = Partial<PersonCreate>;

export type PaginatedPeopleResponse = PaginatedResponse<Person>;

/** Person CRUD. Every call is scoped to the signed-in user by the API. */
export const peopleAPI = {
  /**
   * Create a person. Names are unique per diver, compared case-insensitively
   * and trimmed, so a second "Alex" is a flat 422. Linking a username counts
   * against a per-user limit and answers 429 past it.
   */
  async createPerson(data: PersonCreate): Promise<Person> {
    const response = await apiClient.post(`/person`, data);
    return response.data;
  },

  /**
   * A page of the diver's people, by name. `search` narrows server-side to
   * people whose name or linked username contains it, case-insensitively - the
   * API caps `items_per_page` at 100, so this is a page of matches, never the
   * whole set.
   */
  async getPeople(
    page: number = 1,
    items_per_page: number = 10,
    search?: string,
  ): Promise<PaginatedPeopleResponse> {
    const response = await apiClient.get(`/people`, {
      params: {
        page,
        items_per_page,
        ...(search ? { search } : {}),
      },
    });
    return response.data;
  },

  async getPerson(personUuid: string): Promise<Person> {
    const response = await apiClient.get(`/person/${personUuid}`);
    return response.data;
  },

  /**
   * Update a person. The API answers with a status message, not the person, so a
   * caller assembles the saved record itself.
   */
  async updatePerson(
    personUuid: string,
    data: PersonUpdate,
  ): Promise<{ message: string }> {
    const response = await apiClient.patch(`/person/${personUuid}`, data);
    return response.data;
  },

  /**
   * Delete a person. Every dive, trip and course it was on keeps everything
   * else, and every card it signed stops naming an instructor. There is no
   * reassign option to pass, and a second delete on the same uuid is a 404.
   */
  async deletePerson(personUuid: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/person/${personUuid}`);
    return response.data;
  },
};

/**
 * Every person the diver has, for a surface that names several at once. One
 * request for anyone realistic, where a lookup per uuid would be one per name on
 * screen; it stops at `fetchAllPages`' ceiling with a warning, as the contacts
 * read does.
 */
export async function fetchAllPeople(signal?: AbortSignal): Promise<Person[]> {
  return fetchAllPages(
    (page, itemsPerPage) => peopleAPI.getPeople(page, itemsPerPage),
    { signal, label: "people", keyOf: (person) => person.uuid },
  );
}
