import { apiClient, fetchAllPages } from "./client";
import type { PaginatedResponse } from "./client";

/**
 * The training agency that issued a certification. Mirrors the API's
 * `CertificationAgency` enum - a closed vocabulary rather than free text, so the
 * same agency is named the same way across a diver's whole list and the UI can
 * badge and group by it.
 *
 * Declared roughly by how many divers hold cards from each rather than
 * alphabetically: `CERTIFICATION_AGENCIES` drives option order in both pickers
 * that offer it - the certification dialog and the course dialog - and most
 * people reach for the first two. It also backs both `z.enum()`s
 * (`validations/certification.ts`, `validations/course.ts`), so this one array is
 * the whole vocabulary and widening it here reaches all four. Keep in sync with
 * the API.
 *
 * **Value for value, and in order, the DiveJSON vocabulary** (spec §6.16, shared
 * with §6.17's courses). On a certification `agency` is a REQUIRED member of a
 * closed set; on a course it is OPTIONAL, drawn from this same set when it is
 * there at all. The format freezes a closed set's values at 1.0, so the twenty
 * that arrived with its last widening before the tag (`ndl` to `diwa`) are the
 * last additions there will be without a major version. They are here rather
 * than laundered through `other`/`agency_other` on the way in, which would have
 * made a round trip lossy on a member the format guarantees where it appears at
 * all.
 */
export const CERTIFICATION_AGENCIES = [
  "padi",
  "ssi",
  "naui",
  "sdi",
  "tdi",
  "cmas",
  "raid",
  "bsac",
  "gue",
  "iantd",
  "psai",
  "dan",
  "efr",
  "andi",
  "snsi",
  "acuc",
  "pss",
  "ida",
  "ndl",
  "utd",
  "saa",
  "scotsac",
  "iac",
  "protec",
  "pdic",
  "nase",
  "sei",
  "ymca",
  "erdi",
  "aida",
  "molchanovs",
  "pfi",
  "apnea_academy",
  "fii",
  "nss_cds",
  "nacd",
  "idea",
  "diwa",
  "other",
] as const;

export type CertificationAgency = (typeof CERTIFICATION_AGENCIES)[number];

/**
 * What the certification form opens on, mirroring the order above: PADI is the
 * agency most divers hold a card from, so it is the pick that needs changing
 * least often. Named rather than repeated because the create form, its
 * reset-on-open and the course prefill all have to agree on it.
 */
export const DEFAULT_CERTIFICATION_AGENCY: CertificationAgency = "padi";

// Display labels, each the agency's own short name: mostly acronyms, and the rest
// spelled as the agency spells itself (ScotSAC, ProTec, NSS-CDS), so none of them
// can be derived by capitalizing the value.
const CERTIFICATION_AGENCY_LABELS: Record<CertificationAgency, string> = {
  padi: "PADI",
  ssi: "SSI",
  naui: "NAUI",
  sdi: "SDI",
  tdi: "TDI",
  cmas: "CMAS",
  raid: "RAID",
  bsac: "BSAC",
  gue: "GUE",
  iantd: "IANTD",
  psai: "PSAI",
  dan: "DAN",
  efr: "EFR",
  andi: "ANDI",
  snsi: "SNSI",
  acuc: "ACUC",
  pss: "PSS",
  ida: "IDA",
  ndl: "NDL",
  utd: "UTD",
  saa: "SAA",
  scotsac: "ScotSAC",
  iac: "IAC",
  protec: "ProTec",
  pdic: "PDIC",
  nase: "NASE",
  sei: "SEI",
  ymca: "YMCA",
  erdi: "ERDI",
  aida: "AIDA",
  molchanovs: "Molchanovs",
  pfi: "PFI",
  apnea_academy: "Apnea Academy",
  fii: "FII",
  nss_cds: "NSS-CDS",
  nacd: "NACD",
  idea: "IDEA",
  diwa: "DIWA",
  other: "Other",
};

/**
 * Label for an agency, tolerating a value this build doesn't know about (an API
 * that has grown a new agency shouldn't render as a blank cell). For `other` the
 * diver's own `agency_other` is the useful label, so callers pass it in.
 */
export function certificationAgencyLabel(
  agency: string | null | undefined,
  agencyOther?: string | null,
): string | null {
  if (!agency) return null;
  if (agency === "other") return agencyOther?.trim() || "Other";
  return CERTIFICATION_AGENCY_LABELS[agency as CertificationAgency] ?? agency;
}

/**
 * Names one certification for a screen reader: the agency and the level, e.g.
 * "PADI Advanced Nitrox". Certifications carry no unique-name constraint - a
 * diver can hold the same level from two agencies, and often does - so the name
 * alone would leave two rows' controls indistinguishable. Falls back to the bare
 * name when the agency is missing.
 */
export function certificationLabel(certification: {
  name: string;
  agency?: string | null;
  agency_other?: string | null;
}): string {
  const agency = certificationAgencyLabel(
    certification.agency,
    certification.agency_other,
  );
  return agency ? `${agency} ${certification.name}` : certification.name;
}

/**
 * Which face of the physical card a stored file shows.
 */
export const CERTIFICATION_SIDES = ["front", "back"] as const;
export type CertificationSide = (typeof CERTIFICATION_SIDES)[number];

/**
 * Display names for each card side, so the UI never renders the raw enum value.
 * Bare nouns: these head a slot and are read into the upload and removal toasts,
 * and anything qualifying one of them says the other is required - which neither
 * is, no card image reaching `certificationSchema` at all.
 */
export const CERTIFICATION_SIDE_LABELS: Record<CertificationSide, string> = {
  front: "Front",
  back: "Back",
};

/**
 * What the API accepts for a card image, mirrored here so the file picker can
 * filter and so an obviously-wrong file is rejected before it is uploaded. The
 * API sniffs the actual bytes regardless - this is convenience, not validation.
 */
export const CERTIFICATION_FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf";
export const MAX_CERTIFICATION_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Metadata about one stored card image or PDF - never its bytes. The file itself
// is fetched separately (and authenticated) via `getCertificationFileBlob`.
export interface CertificationFileInfo {
  uuid: string;
  side: CertificationSide;
  content_type: string;
  byte_size: number;
  original_filename: string;
  updated_at?: string | null;
}

// A diving certification, with photos or scans of the physical c-card.
export interface Certification {
  uuid: string;
  agency: CertificationAgency;
  // Only set when `agency` is `other` - the name of the issuing body.
  agency_other?: string | null;
  // The level as printed on the card, e.g. "Advanced Open Water Diver".
  name: string;
  certification_number?: string | null;
  certified_on?: string | null;
  // Most recreational certifications never expire; rescue, first-aid and most
  // technical ones do.
  expires_on?: string | null;
  instructor_name?: string | null;
  instructor_number?: string | null;
  // Who ran the course the card came out of - a contact, by uuid.
  contact_uuid?: string | null;
  notes?: string;
  // The training course this card came out of, if the diver recorded one. The
  // instructor fields and the contact above are deliberately *not* derived from
  // it: imported history arrives certification-first, with no course to hang
  // them on, so a certification has to stand alone.
  course_uuid?: string | null;
  // Stored card images, embedded by the API so the list can show which cards have
  // photos without a request per row. Optional so a client built against an older
  // API (or a cached response predating the field) still type-checks.
  files?: CertificationFileInfo[];
  user_uuid: string;
  created_at: string;
}

export interface CertificationCreate {
  agency: CertificationAgency;
  agency_other?: string | null;
  name: string;
  certification_number?: string | null;
  certified_on?: string | null;
  expires_on?: string | null;
  instructor_name?: string | null;
  instructor_number?: string | null;
  contact_uuid?: string | null;
  notes?: string;
  course_uuid?: string | null;
}

// `null` on `course_uuid` or `contact_uuid` detaches the certification from its
// course or its contact; omitting the key leaves the link alone. The API takes
// this shape as its own `CertificationUpdateRequest`, kept apart from the schema
// its admin panel writes through - neither uuid is a column there.
export type CertificationUpdate = Partial<CertificationCreate>;

export type PaginatedCertificationsResponse = PaginatedResponse<Certification>;

// One row of `GET /certifications-expiring`: just enough to render a dashboard line.
// Deliberately not a trimmed `Certification` - it carries no `files`, and `expires_on`
// is required here because the endpoint only returns cards that have one.
export interface CertificationExpiringEntry {
  uuid: string;
  agency: CertificationAgency;
  agency_other?: string | null;
  name: string;
  expires_on: string;
}

export interface CertificationExpiringResponse {
  data: CertificationExpiringEntry[];
  // True when the API's row cap (`EXPIRING_OVERVIEW_LIMIT`, 200) was hit. Optional
  // for the same reason as `GearServiceDueResponse.truncated` - a response cached
  // before the field existed must read as complete, not as a false alarm.
  truncated?: boolean;
}

/**
 * Find one side's stored file in a certification's embedded metadata.
 */
export function certificationFile(
  certification: Certification,
  side: CertificationSide,
): CertificationFileInfo | undefined {
  return certification.files?.find((file) => file.side === side);
}

/**
 * Certification CRUD, plus upload/download of the card images.
 *
 * The image endpoints are owner-only and require an `Authorization` header, so a stored
 * card cannot be used as a plain `<img src>` - `useAuthedBlobUrl` is what bridges that.
 */
export const certificationsAPI = {
  // Create a certification, owned by the signed-in user. Card images are
  // attached afterwards with `uploadCertificationFile`.
  async createCertification(data: CertificationCreate): Promise<Certification> {
    const response = await apiClient.post(`/certification`, data);
    return response.data;
  },

  // Get a user's certifications (paginated), newest first. `courseUuid` narrows
  // the list to the cards one training course issued, which is what a course's
  // own page reads; one naming a course that doesn't exist or isn't the caller's
  // returns an empty page rather than an error.
  async getCertifications(
    page: number = 1,
    items_per_page: number = 10,
    courseUuid?: string,
  ): Promise<PaginatedCertificationsResponse> {
    const response = await apiClient.get(`/certifications`, {
      params: {
        page,
        items_per_page,
        ...(courseUuid !== undefined ? { course_uuid: courseUuid } : {}),
      },
    });
    return response.data;
  },

  async getCertification(certificationUuid: string): Promise<Certification> {
    const response = await apiClient.get(`/certification/${certificationUuid}`);
    return response.data;
  },

  // Every certification the user owns that carries an expiry date, soonest first.
  // The certification twin of `gearServiceAPI.getDue`, and like it takes no date
  // horizon: a server-side "expiring within N days" filter would bake today's date
  // into the cached response and go wrong at midnight, so the client buckets these
  // itself (see `certificationRenewals`).
  async getExpiring(): Promise<CertificationExpiringResponse> {
    const response = await apiClient.get(`/certifications-expiring`);
    return response.data;
  },

  async updateCertification(
    certificationUuid: string,
    data: CertificationUpdate,
  ): Promise<void> {
    await apiClient.patch(`/certification/${certificationUuid}`, data);
  },

  async deleteCertification(certificationUuid: string): Promise<void> {
    await apiClient.delete(`/certification/${certificationUuid}`);
  },

  // Attach or replace one side's card image. Uploading a side that already has a
  // file replaces it, so a replacement needs no delete in front of it.
  //
  // The `Content-Type` header is explicitly cleared so the browser sets
  // `multipart/form-data` *with its own boundary* - the same reason
  // `dives.ts::parseDiveFile` does it.
  async uploadCertificationFile(
    certificationUuid: string,
    side: CertificationSide,
    file: Blob,
    // Named separately rather than read off a `File`, because the common case is
    // no longer one: an image picked here is cropped to the standard card shape
    // first, and what comes back off the canvas is a bare `Blob` whose extension
    // depends on which encoding the browser managed.
    filename: string,
  ): Promise<CertificationFileInfo> {
    const formData = new FormData();
    formData.append("file", file, filename);

    const response = await apiClient.put(
      `/certification/${certificationUuid}/file/${side}`,
      formData,
      { headers: { "Content-Type": undefined } },
    );
    return response.data;
  },

  async deleteCertificationFile(
    certificationUuid: string,
    side: CertificationSide,
  ): Promise<void> {
    await apiClient.delete(`/certification/${certificationUuid}/file/${side}`);
  },

  // Fetch one side's bytes as a Blob.
  //
  // This has to go through the API client rather than being pointed at from an
  // `<img src>`: card files are private, the endpoint requires an `Authorization`
  // header, and an `<img>` cannot send one (the access token lives in memory, not
  // in a cookie). Callers turn the Blob into an object URL - see
  // `hooks/useAuthedBlobUrl.ts`.
  //
  // `version` identifies the current contents (see `CertificationCardImage`) and
  // is sent as a `v` query param the API ignores. Its job is to give each version
  // of a card its own URL: the response is cached with `max-age=300`, so without
  // it the browser would keep serving the old bytes from its own cache for five
  // minutes after a replace, however correctly the app refetches. Stable while
  // the file is unchanged, so repeat views still hit the cache.
  async getCertificationFileBlob(
    certificationUuid: string,
    side: CertificationSide,
    version?: string,
  ): Promise<Blob> {
    const response = await apiClient.get(
      `/certification/${certificationUuid}/file/${side}`,
      { responseType: "blob", params: version ? { v: version } : undefined },
    );
    return response.data;
  },
};

/**
 * Fetches every page of a user's certifications.
 *
 * The dashboard's renewal card used to be the reason this existed; it now asks
 * `getExpiring` instead, which is one request rather than a page walk. For a caller
 * that genuinely needs whole `Certification` records rather than the four fields the
 * renewals card renders - the check-in summary, which prints every card a diver
 * holds, files included.
 */
export async function fetchAllCertifications(
  signal?: AbortSignal,
): Promise<Certification[]> {
  return fetchAllPages(
    (page, itemsPerPage) =>
      certificationsAPI.getCertifications(page, itemsPerPage),
    {
      signal,
      label: "certifications",
      keyOf: (certification) => certification.uuid,
    },
  );
}
