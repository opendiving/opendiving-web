import { API_BASE_URL } from "@/lib/api-base";
import type { CheckInDiver, DivingFiguresWire } from "@/lib/checkin";
import type { UnitSystem } from "@/lib/units";
import { apiClient } from "./client";

/** `POST /user/checkin-link`'s answer: the one response that ever carries the token. */
export interface CheckinLinkMinted {
  token: string;
  expires_at: string;
}

/** The diver's live link as `GET /user/checkin-link` describes it - without its token. */
export interface CheckinLinkLive {
  expires_at: string;
}

/** What a link shows about the diver, and the system its depth prints in. */
export interface SharedCheckInDiver extends CheckInDiver {
  units: UnitSystem;
}

/**
 * One card as a link shows it. `front_content_type` stands in for the signed-in list's
 * `files`: null for a card with no front, and the only thing the sheet needs to decide
 * between drawing the front and naming it a PDF. Nothing about the back.
 */
export interface SharedCheckInCertification {
  uuid: string;
  agency: string;
  agency_other?: string | null;
  name: string;
  certification_number?: string | null;
  certified_on?: string | null;
  expires_on?: string | null;
  instructor_name?: string | null;
  contact_name?: string | null;
  front_content_type: string | null;
}

/** `GET /checkin/{token}`: everything the check-in page prints, and when the link stops. */
export interface SharedCheckIn {
  expires_at: string;
  diver: SharedCheckInDiver;
  diving: DivingFiguresWire;
  certifications: SharedCheckInCertification[];
}

/**
 * The signed-in diver's own check-in link: one live at a time, 24 hours each.
 */
export const checkinLinkAPI = {
  /**
   * Makes a link showing the page with these figures for its whole life, retiring any
   * link made before it. The token is in this response and nowhere else - the API keeps
   * only its hash - so the caller holds it for as long as it wants to show it.
   */
  async mint(figures: DivingFiguresWire): Promise<CheckinLinkMinted> {
    const response = await apiClient.post<CheckinLinkMinted>(
      "/user/checkin-link",
      figures,
    );
    return response.data;
  },

  /** When the live link expires, or null when there is none. Never its token. */
  async live(signal?: AbortSignal): Promise<CheckinLinkLive | null> {
    try {
      const response = await apiClient.get<CheckinLinkLive>(
        "/user/checkin-link",
        { signal },
      );
      return response.data;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404) return null;
      throw error;
    }
  },

  /** Stops the live link at its next request. Succeeds with nothing to revoke. */
  async revoke(): Promise<void> {
    await apiClient.delete("/user/checkin-link");
  },
};

const sharedBase = (token: string) =>
  `${API_BASE_URL}/checkin/${encodeURIComponent(token)}`;

/**
 * The page a link shows, read the way whoever holds the link reads it: with `fetch`
 * rather than the API client, so no bearer token and no cookie goes with it. The token
 * in the path is the credential. Null for every dead link - unknown, expired, revoked -
 * which the API answers identically on purpose.
 */
export async function fetchSharedCheckIn(
  token: string,
  signal?: AbortSignal,
): Promise<SharedCheckIn | null> {
  const response = await fetch(sharedBase(token), {
    credentials: "omit",
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GET /checkin/{token} answered ${response.status}`);
  }
  return (await response.json()) as SharedCheckIn;
}

// Plain `<img src>`s at the API, like a species photo and unlike every other picture of
// the diver's: an `<img>` carries no bearer token, and here none is needed.
export const sharedPortraitUrl = (token: string) =>
  `${sharedBase(token)}/portrait`;

export const sharedCardFrontUrl = (token: string, certificationUuid: string) =>
  `${sharedBase(token)}/certification/${encodeURIComponent(certificationUuid)}/front`;

/** The address a desk opens: this origin's page for the token, not the API's route. */
export function checkinLinkUrl(origin: string, token: string): string {
  return `${origin}/checkin/${encodeURIComponent(token)}`;
}
