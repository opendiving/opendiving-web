import type { InsurancePolicy } from "@/lib/api/checkin-details";
import {
  certificationAgencyLabel,
  type CertificationExpiringEntry,
  type CertificationFileInfo,
} from "@/lib/api/certifications";
import { daysBetweenIsoDates, todayIsoDate } from "@/lib/gear-service";

// A token identifying the *current contents* of a stored card file, or `null` when
// there is no file.
//
// This is what makes replacing a card image actually show the new one. The image is
// fetched per (certification, side), and neither of those changes when a file is
// replaced - so a fetch keyed on them alone never re-runs and the previous image stays
// on screen while the filename beside it updates. It is also sent as a `v` query param
// so each version gets its own browser-cache entry, the response being cacheable for
// five minutes at a URL whose contents can change.
//
// `updated_at` moves on every replace; `uuid` covers delete-then-upload, which creates
// a new row rather than updating the old one. Together they change whenever the bytes
// do, and only then.
export function certificationFileVersion(
  file: CertificationFileInfo | null | undefined,
): string | null {
  if (!file) return null;
  return `${file.uuid}:${file.updated_at ?? ""}`;
}

// The shape every card is drawn in, and cropped to on the way in.
//
// Measured from a current PADI e-card (1013x638). A diver's cards arrive in at
// least four shapes - old PADI 1005x660, RAID 802x519, TDI/SDI 330x207 - so one
// ratio everywhere is what makes a row of cards read as a row of cards. It is the
// current PADI one rather than the ID-1 credit card's 85.6/53.98 because that is
// what agencies actually issue, and the two differ by under a quarter of a percent.
//
// New uploads are cropped to it, so their stored bytes *are* this shape. Anything
// stored uncropped is drawn `object-cover`, which trims at most 4% off the tallest
// of them - the old PADI design, which carries nothing near its edges.
export const CERTIFICATION_CARD_ASPECT = 1013 / 638;

// The same ratio as a Tailwind class. Spelled out because Tailwind only generates
// the classes it finds written down: `aspect-[${...}]` compiles to nothing.
// `certification.test.ts` holds the two in step.
export const CERTIFICATION_CARD_ASPECT_CLASS = "aspect-[1013/638]";

// The widest a cropped card is exported at, which is about what an agency issues
// and twice the biggest mount in the app. The API stores these bytes as they arrive
// - it sniffs the type and never renders anything from them, as it does for the two
// pictures - so this is the only thing bounding what a diver's card costs.
export const CERTIFICATION_CARD_EXPORT_WIDTH = 1024;

// How far ahead a certification counts as "expiring soon".
//
// Longer than gear's 30-day window on purpose: renewing a rescue or first-aid
// card means booking onto a course with an instructor, not dropping a regulator
// off at a shop. Ninety days is roughly the notice needed to get that booked
// before a trip.
export const CERTIFICATION_EXPIRING_SOON_DAYS = 90;

export type CertificationExpiryStatus = "expiring_soon" | "expired";

// Whether a certification's expiry is worth flagging, or `null` when it isn't -
// which covers both "no expiry date" (most recreational cards never expire) and
// "expires, but not for a while".
//
// `null` rather than an "ok" status because the vast majority of rows have no
// expiry at all, and badging them all "valid" would bury the two that matter.
// Same reasoning as `worstServiceStatus` returning `null` for untracked gear.
export function certificationExpiryStatus(
  expiresOn: string | null | undefined,
  today: string = todayIsoDate(),
): CertificationExpiryStatus | null {
  if (!expiresOn) return null;

  const daysLeft = daysBetweenIsoDates(today, expiresOn);
  if (daysLeft < 0) return "expired";
  if (daysLeft <= CERTIFICATION_EXPIRING_SOON_DAYS) return "expiring_soon";
  return null;
}

export function certificationExpiryLabel(
  status: CertificationExpiryStatus,
): string {
  return status === "expired" ? "Expired" : "Expiring soon";
}

// One row of the renewals list: a certification worth chasing, its status,
// and its expiry date already narrowed to a plain string - a flagged certification
// always has one, since a missing date can't produce a status.
export interface CertificationRenewal<T> {
  certification: T;
  status: CertificationExpiryStatus;
  expiresOn: string;
}

// The certifications that need renewing, most urgent first.
//
// Generic over the certification shape so it can be tested against bare
// `{ expires_on }` fixtures rather than whole API objects - the only field it reads.
//
// Sorting ascending by expiry date is all that's needed to put the expired ones on top:
// they are precisely the ones whose dates are already behind us.
export function certificationRenewals<T extends { expires_on?: string | null }>(
  certifications: T[],
  today: string = todayIsoDate(),
): CertificationRenewal<T>[] {
  return certifications
    .flatMap((certification) => {
      const status = certificationExpiryStatus(certification.expires_on, today);
      if (!status) return [];
      return [
        {
          certification,
          status,
          expiresOn: certification.expires_on as string,
        },
      ];
    })
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
}

// One line of the renewals list, whatever it is a renewal of: what runs out, what kind
// of thing it is, where it is kept, and the date it runs out on.
export interface Renewable {
  // A certification's uuid, or "insurance-" and the policy's position in the list.
  key: string;
  // Which form renews it: the certification's own dialog, or the check-in details'
  // insurance group.
  kind: "certification" | "insurance";
  title: string;
  detail: string | null;
  href: string;
  expires_on: string;
}

// Everything with an expiry date a diver might have to renew: the dated certifications,
// and every dated insurance policy beside them, since a lapsed policy stops a dive at
// the desk exactly as a lapsed rescue card does. Unfiltered - `certificationRenewals`
// picks the ones worth flagging, and sorts them into one list so the soonest leads
// whichever kind it is.
//
// Certification rows link to `/certifications`: certifications are edited in dialogs on
// that one page, so there is no per-certification URL. A policy links to
// `/settings/checkin`, where the policies are kept. Policies have no id of their own on
// the wire, so a row is keyed by its place in the diver's list and named by its
// provider, which every policy has.
export function renewables(
  certifications: CertificationExpiringEntry[],
  policies: readonly InsurancePolicy[],
): Renewable[] {
  const rows: Renewable[] = certifications.map((certification) => ({
    key: certification.uuid,
    kind: "certification",
    title: certification.name,
    detail: certificationAgencyLabel(
      certification.agency,
      certification.agency_other,
    ),
    href: "/certifications",
    expires_on: certification.expires_on,
  }));

  policies.forEach((policy, index) => {
    if (!policy.expires_on) return;
    rows.push({
      key: `insurance-${index}`,
      kind: "insurance",
      title: policy.provider,
      detail: "Dive insurance",
      href: "/settings/checkin",
      expires_on: policy.expires_on,
    });
  });

  return rows;
}

// Maps onto the `Badge` variants already in the design system, on the same filled
// brand scale as `serviceStatusBadgeVariant`: `destructive` for the state that has
// already gone wrong, the brand `coral` for the one that is about to. There is no
// `teal` counterpart here because there is no settled state to paint - a
// certification with plenty of time left produces no status at all and never
// reaches this function, which is why a row exists only when something is flagged.
//
// Never `secondary`: grey beside a coral "Due soon" in the same notifications list
// reads as "not really a status".
export function certificationExpiryBadgeVariant(
  status: CertificationExpiryStatus,
): "destructive" | "coral" {
  return status === "expired" ? "destructive" : "coral";
}
