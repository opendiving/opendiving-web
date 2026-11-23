import {
  apiClient,
  fetchAllPages,
  lookupFetcher,
  versionedRequest,
} from "./client";
import { labelOrFallback } from "./labels";
import type {
  MessageResponse,
  PaginatedResponse,
  SearchFilters,
} from "./client";

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

const PERSON_ROLE_LABELS: Record<PersonRole, string> = {
  buddy: "Buddy",
  guide: "Guide",
  instructor: "Instructor",
  student: "Student",
  companion: "Companion",
};

/**
 * A role's display name. The API reads a stored role back as a plain string, so
 * one this build has never heard of falls back as `labelOrFallback` says.
 */
export function personRoleLabel(role: string): string {
  return labelOrFallback(PERSON_ROLE_LABELS, role);
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
  // The *current* username of the account on this instance the person is
  // connected to, or null when not connected. Joined on every read, so a rename
  // shows through and a purged account reads null.
  username?: string | null;
  // That account's picture version, the `v` of `getPersonPictureBlob`: null when
  // the person is not connected, the account has no picture, or it has asked to
  // be deleted - which is why a person can carry a username and no picture.
  avatar_sha256?: string | null;
  // The live dives that name this person - what the dives list's `person_uuid`
  // filter matches, so the People page's count and the person's page agree.
  dive_count: number;
  created_at: string;
  updated_at?: string | null;
}

/**
 * What connects a person to an account, at most one per body: the token of a live
 * connect link, or the public id of an account under the diver's Added you. Each
 * is refused with a 422 on its own member - a dead link, no such tie, the diver's
 * own account, an account another of their people is connected to - which
 * `getApiFieldError` reads.
 */
export type PersonConnection =
  | { connect_link: string; connect_account?: never }
  | { connect_account: string; connect_link?: never };

export interface PersonFields {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string;
}

export type PersonCreate = PersonFields & Partial<PersonConnection>;

/**
 * The `PATCH /person/{uuid}` body. An explicit `null` clears the email or the
 * phone; `name` and `notes` take no null. Omitting a key leaves it alone. A
 * connection member connects a person who is not connected yet; disconnecting is
 * `disconnectPerson`.
 */
export type PersonUpdate = Partial<PersonFields> & Partial<PersonConnection>;

/**
 * One row of `GET /people/added-you`: an account that has the diver in its
 * people and that the diver has not added, by its public id, its current name,
 * username and picture version. It sees the diver's name, username and picture.
 */
export interface AddedYouRow {
  uuid: string;
  name: string;
  username: string;
  avatar_sha256?: string | null;
}

/** One row of `GET /people/lookup`: the name and the connected account's current username. */
export interface PersonLookupItem {
  uuid: string;
  name: string;
  username?: string | null;
}

/** Person CRUD. Every call is scoped to the signed-in user by the API. */
export const peopleAPI = {
  /**
   * Create a person. Names are unique per diver, compared case-insensitively
   * and trimmed, so a second "Alex" is a flat 422.
   */
  async createPerson(data: PersonCreate): Promise<Person> {
    const response = await apiClient.post<Person>(`/person`, data);
    return response.data;
  },

  /**
   * A page of the diver's people, by name. `search` narrows server-side to
   * people whose name or connected username contains it, case-insensitively - the
   * API caps `items_per_page` at 100, so this is a page of matches, never the
   * whole set.
   */
  async getPeople(
    page: number = 1,
    items_per_page: number = 10,
    { search }: SearchFilters = {},
  ): Promise<PaginatedResponse<Person>> {
    const response = await apiClient.get<PaginatedResponse<Person>>(`/people`, {
      params: {
        page,
        items_per_page,
        ...(search ? { search } : {}),
      },
    });
    return response.data;
  },

  /**
   * A page of the diver's people as a picker lists them, whoever was last on a
   * dive at or before `until` first, then people on no such dive, newest first.
   * `search` matches what `getPeople` matches.
   */
  lookupPeople: lookupFetcher<PersonLookupItem>(`/people/lookup`),

  /** One person by uuid. */
  async getPerson(personUuid: string): Promise<Person> {
    const response = await apiClient.get<Person>(`/person/${personUuid}`);
    return response.data;
  },

  /**
   * Update a person. The API answers with a status message, not the person, so a
   * caller assembles the saved record itself.
   */
  async updatePerson(
    personUuid: string,
    data: PersonUpdate,
  ): Promise<MessageResponse> {
    const response = await apiClient.patch<MessageResponse>(
      `/person/${personUuid}`,
      data,
    );
    return response.data;
  },

  /**
   * Disconnect a person from the account it is connected to, keeping the person:
   * it loses that account's picture and username, and the diver leaves that
   * account's Added you. The account is not told. Answers the person, the same
   * for one that was not connected.
   */
  async disconnectPerson(personUuid: string): Promise<Person> {
    const response = await apiClient.post<Person>(
      `/person/${personUuid}/disconnect`,
    );
    return response.data;
  },

  /**
   * The picture of the account a person is connected to. `version` is the
   * person's `avatar_sha256`; the API never lets the browser store the bytes, so
   * a cut tie stops the next read.
   */
  async getPersonPictureBlob(
    personUuid: string,
    version?: string,
  ): Promise<Blob> {
    const response = await apiClient.get<Blob>(
      `/person/${personUuid}/avatar`,
      versionedRequest(version, { responseType: "blob" }),
    );
    return response.data;
  },

  /** A page of the diver's Added you, ordered by the account's name. */
  async getAddedYou(
    page: number = 1,
    items_per_page: number = 50,
  ): Promise<PaginatedResponse<AddedYouRow>> {
    const response = await apiClient.get<PaginatedResponse<AddedYouRow>>(
      `/people/added-you`,
      { params: { page, items_per_page } },
    );
    return response.data;
  },

  /** The picture of an account under the diver's Added you, as `getPersonPictureBlob`. */
  async getAddedYouPictureBlob(
    accountUuid: string,
    version?: string,
  ): Promise<Blob> {
    const response = await apiClient.get<Blob>(
      `/people/added-you/${accountUuid}/avatar`,
      versionedRequest(version, { responseType: "blob" }),
    );
    return response.data;
  },

  /**
   * Hide an account from the diver's Added you. Nothing else changes, and there
   * is no undo: it comes back only when its tie is cut and made again. A 404
   * where the account no longer has the diver in its people.
   */
  async hideAddedYou(accountUuid: string): Promise<MessageResponse> {
    const response = await apiClient.post<MessageResponse>(
      `/people/added-you/${accountUuid}/hide`,
    );
    return response.data;
  },

  /**
   * Cut an account's tie to the diver: its person stays, as a name with no
   * picture and no username, and it is not told. It can connect again through
   * the diver's connect link while that stands; an import does not connect it
   * again. A 404 where there is no tie, a second disconnect among them.
   */
  async disconnectAddedYou(accountUuid: string): Promise<MessageResponse> {
    const response = await apiClient.post<MessageResponse>(
      `/people/added-you/${accountUuid}/disconnect`,
    );
    return response.data;
  },

  /**
   * Delete a person. Every dive, trip and course it was on keeps everything
   * else, and every card it signed stops naming an instructor. There is no
   * reassign option to pass, and a second delete on the same uuid is a 404.
   */
  async deletePerson(personUuid: string): Promise<MessageResponse> {
    const response = await apiClient.delete<MessageResponse>(
      `/person/${personUuid}`,
    );
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
