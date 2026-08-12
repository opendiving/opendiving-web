import { describe, expect, it } from "vitest";
import {
  CERTIFICATION_EXPIRING_SOON_DAYS,
  certificationExpiryBadgeVariant,
  certificationExpiryLabel,
  certificationExpiryStatus,
  certificationFileVersion,
  certificationRenewals,
} from "./certification";
import type { CertificationFileInfo } from "./api/certifications";

const TODAY = "2026-08-10";

const file = (
  overrides: Partial<CertificationFileInfo> = {},
): CertificationFileInfo => ({
  uuid: "019fe94e-c13c-7166-9dad-5af54eb08319",
  side: "front",
  content_type: "image/png",
  byte_size: 1234,
  original_filename: "card.png",
  updated_at: null,
  ...overrides,
});

describe("certificationFileVersion", () => {
  it("is null when there is no file", () => {
    expect(certificationFileVersion(null)).toBeNull();
    expect(certificationFileVersion(undefined)).toBeNull();
  });

  it("changes when a file is replaced", () => {
    // The regression this exists for: replacing a card image keeps the same
    // certification, the same side and the same row, so anything keyed on those
    // alone leaves the *old* image on screen. Only `updated_at` moves.
    const before = certificationFileVersion(file());
    const after = certificationFileVersion(
      file({ updated_at: "2026-08-10T02:00:08.371436Z" }),
    );

    expect(after).not.toBe(before);
  });

  it("changes again on a second replace", () => {
    const first = certificationFileVersion(
      file({ updated_at: "2026-08-10T02:00:08.371436Z" }),
    );
    const second = certificationFileVersion(
      file({ updated_at: "2026-08-10T02:04:11.902001Z" }),
    );

    expect(second).not.toBe(first);
  });

  it("changes when a file is deleted and re-uploaded", () => {
    // That path inserts a new row rather than updating the old one, so the uuid
    // moves while `updated_at` goes back to null - which would otherwise collide
    // with the original version token exactly.
    const before = certificationFileVersion(file());
    const after = certificationFileVersion(
      file({ uuid: "019fe966-119e-755e-9957-9f0f63d8101a" }),
    );

    expect(after).not.toBe(before);
  });

  it("is stable while the file is unchanged", () => {
    // Repeat views must keep hitting the same cache entry rather than refetching
    // megabytes on every mount.
    expect(certificationFileVersion(file())).toBe(
      certificationFileVersion(file()),
    );
  });

  it("does not change for metadata that doesn't affect the bytes served", () => {
    // `side` is already part of the URL, so folding it in here would only cause
    // needless refetches.
    expect(certificationFileVersion(file({ side: "back" }))).toBe(
      certificationFileVersion(file()),
    );
  });
});

describe("certificationExpiryStatus", () => {
  it("is null when there is no expiry date", () => {
    // Most recreational certifications never expire, so this is the common case.
    expect(certificationExpiryStatus(null, TODAY)).toBeNull();
    expect(certificationExpiryStatus(undefined, TODAY)).toBeNull();
    expect(certificationExpiryStatus("", TODAY)).toBeNull();
  });

  it("is null for an expiry comfortably in the future", () => {
    expect(certificationExpiryStatus("2027-08-10", TODAY)).toBeNull();
  });

  it("flags an expiry in the past", () => {
    expect(certificationExpiryStatus("2026-08-09", TODAY)).toBe("expired");
    expect(certificationExpiryStatus("2020-01-01", TODAY)).toBe("expired");
  });

  it("treats an expiry today as still valid, not expired", () => {
    // A card is good through its printed expiry date - a shop would accept it.
    expect(certificationExpiryStatus(TODAY, TODAY)).toBe("expiring_soon");
  });

  it("flags an expiry inside the notice window", () => {
    expect(certificationExpiryStatus("2026-09-01", TODAY)).toBe(
      "expiring_soon",
    );
  });

  it("includes the last day of the notice window", () => {
    // 2026-08-10 + 90 days
    expect(certificationExpiryStatus("2026-11-08", TODAY)).toBe(
      "expiring_soon",
    );
  });

  it("excludes the day after the notice window", () => {
    expect(certificationExpiryStatus("2026-11-09", TODAY)).toBeNull();
  });

  it("uses a 90-day window", () => {
    expect(CERTIFICATION_EXPIRING_SOON_DAYS).toBe(90);
  });

  it("crosses a year boundary correctly", () => {
    expect(certificationExpiryStatus("2027-01-05", "2026-12-20")).toBe(
      "expiring_soon",
    );
    expect(certificationExpiryStatus("2026-12-20", "2027-01-05")).toBe(
      "expired",
    );
  });
});

describe("certificationRenewals", () => {
  const card = (name: string, expires_on: string | null) => ({
    name,
    expires_on,
  });

  it("is empty when nothing needs renewing", () => {
    // The normal case for a recreational diver, and what keeps the dashboard card
    // off the page entirely.
    expect(
      certificationRenewals(
        [card("OW", null), card("AOW", "2030-01-01")],
        TODAY,
      ),
    ).toEqual([]);
  });

  it("keeps only the cards inside the notice window or already gone", () => {
    const renewals = certificationRenewals(
      [
        card("OW", null),
        card("Rescue", "2026-09-01"),
        card("Nitrox", "2030-01-01"),
        card("EFR", "2026-01-01"),
      ],
      TODAY,
    );

    expect(renewals.map((renewal) => renewal.certification.name)).toEqual([
      "EFR",
      "Rescue",
    ]);
  });

  it("puts expired cards ahead of ones merely expiring soon", () => {
    // Sorting is by date alone; this is the property that behaviour rests on, so it
    // gets its own test rather than being assumed from the implementation.
    const renewals = certificationRenewals(
      [card("Rescue", "2026-10-30"), card("EFR", "2026-08-09")],
      TODAY,
    );

    expect(renewals.map((renewal) => renewal.status)).toEqual([
      "expired",
      "expiring_soon",
    ]);
  });

  it("orders several expired cards oldest first", () => {
    const renewals = certificationRenewals(
      [card("EFR", "2025-01-01"), card("Rescue", "2019-06-30")],
      TODAY,
    );

    expect(renewals.map((renewal) => renewal.certification.name)).toEqual([
      "Rescue",
      "EFR",
    ]);
  });

  it("narrows the expiry date to a plain string", () => {
    // What lets the card render a date without a non-null assertion of its own.
    const [renewal] = certificationRenewals([card("EFR", "2026-09-01")], TODAY);

    expect(renewal.expiresOn).toBe("2026-09-01");
  });
});

describe("expiry presentation", () => {
  it("labels each status", () => {
    expect(certificationExpiryLabel("expired")).toBe("Expired");
    expect(certificationExpiryLabel("expiring_soon")).toBe("Expiring soon");
  });

  it("reserves the loudest badge for an already-expired card", () => {
    expect(certificationExpiryBadgeVariant("expired")).toBe("destructive");
    expect(certificationExpiryBadgeVariant("expiring_soon")).toBe("secondary");
  });
});
