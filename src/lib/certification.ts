import type { CertificationFileInfo } from "@/lib/api/certifications";
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

// One row of the dashboard's renewals card: a certification worth chasing, its status,
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

// Maps onto the `Badge` variants already in the design system. It used to mirror
// `serviceStatusBadgeVariant` and no longer does: gear service moved to a filled
// brand scale (`destructive` / `coral` / `teal`) and certifications did not, so the
// two chips sit on the same dashboard wearing different vocabularies. That is an
// open inconsistency rather than a decision - see "the service scale is three brand
// fills now" in DECISIONS.md.
export function certificationExpiryBadgeVariant(
  status: CertificationExpiryStatus,
): "destructive" | "secondary" {
  return status === "expired" ? "destructive" : "secondary";
}
