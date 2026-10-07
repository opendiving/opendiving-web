import { apiClient } from "./client";

/** One emergency contact. The first in a list is the one a shop calls first. */
export interface EmergencyContact {
  name: string;
  phone: string | null;
  relationship: string | null;
}

/** One insurance policy. `expires_on` is a bare `YYYY-MM-DD`. */
export interface InsurancePolicy {
  provider: string;
  number: string | null;
  expires_on: string | null;
}

/**
 * What a dive shop's desk asks a diver for, held once per account.
 *
 * `email` is the address the diver gives out, which is not the one they sign in with:
 * `User.email` never appears here, and nothing defaults this one from it. A diver who
 * has saved nothing reads as nulls and empty lists rather than a 404, so every reader
 * renders one shape. The dates are bare `YYYY-MM-DD` strings - read them with
 * `formatDateOnly`, never `new Date(...)`.
 */
export interface CheckinDetails {
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  emergency_contacts: EmergencyContact[];
  insurance_policies: InsurancePolicy[];
}

/**
 * `PATCH /user/checkin-details`'s body. A key present replaces its member whole - a
 * scalar with its value, `null` clearing it; a list as a unit, `[]` clearing it - and a
 * key absent leaves its member alone. So a surface sends the group it edits and no other
 * key, and a stale copy elsewhere can revert nothing outside that group. A list sent as
 * `null` is a 422, as is an unknown key.
 */
export interface CheckinDetailsUpdate {
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  emergency_contacts?: EmergencyContact[];
  insurance_policies?: InsurancePolicy[];
}

/** The longest each list may be; the API refuses a longer one. */
export const MAX_EMERGENCY_CONTACTS = 5;
export const MAX_INSURANCE_POLICIES = 5;

/** The details of a diver who has filled none of them in. */
export const EMPTY_CHECKIN_DETAILS: CheckinDetails = {
  email: null,
  phone: null,
  date_of_birth: null,
  emergency_contacts: [],
  insurance_policies: [],
};

/**
 * The signed-in diver's check-in details. Read them through `useCheckinDetails`, which
 * holds the one copy every surface shows, rather than from here.
 */
export const checkinDetailsAPI = {
  /** The whole object. */
  async get(signal?: AbortSignal): Promise<CheckinDetails> {
    const response = await apiClient.get<CheckinDetails>(
      "/user/checkin-details",
      { signal },
    );
    return response.data;
  },

  /** Replaces the members `patch` carries and answers the whole object as it stands. */
  async update(patch: CheckinDetailsUpdate): Promise<CheckinDetails> {
    const response = await apiClient.patch<CheckinDetails>(
      "/user/checkin-details",
      patch,
    );
    return response.data;
  },
};
