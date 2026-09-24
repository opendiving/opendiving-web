import { describe, expect, it } from "vitest";

import {
  checkInAccountSummary,
  checkInProposalValues,
  checkInSubmission,
  checkInWasWritten,
  portraitChoice,
} from "./import-check-in";
import type {
  ImportCheckInDetail,
  ImportReport,
} from "@/lib/api/logbook-import";
import { formatDateOnly } from "@/lib/date-time";
import { EMPTY_USER_FIELDS } from "@/lib/validations/user-fields";

const details: ImportCheckInDetail[] = [
  { detail: "born_on", account: null, proposed: "1988-04-02" },
  { detail: "phone", account: "+44 1", proposed: "+44 2" },
  {
    detail: "emergency_contact",
    account: null,
    proposed: { name: "Alex", phone: "0456", relationship: null },
  },
  {
    detail: "insurance",
    account: { provider: "DAN", number: "P-1", expires_on: "2027-03-01" },
    proposed: { provider: "Aqua", number: null, expires_on: null },
  },
];

describe("checkInProposalValues", () => {
  it("seeds every field a carried fact holds with the proposal, and nothing else", () => {
    expect(checkInProposalValues(details)).toEqual({
      ...EMPTY_USER_FIELDS,
      date_of_birth: "1988-04-02",
      phone: "+44 2",
      emergency_contact_name: "Alex",
      emergency_contact_phone: "0456",
      insurance_provider: "Aqua",
    });
  });
});

describe("checkInAccountSummary", () => {
  it("reads the account's side as one line, dates formatted", () => {
    expect(checkInAccountSummary(details[1])).toBe("+44 1");
    expect(checkInAccountSummary(details[3])).toBe(
      `DAN · P-1 · expires ${formatDateOnly("2027-03-01")}`,
    );
  });

  it("is null where the account holds nothing of the fact", () => {
    expect(checkInAccountSummary(details[0])).toBeNull();
    expect(checkInAccountSummary(details[2])).toBeNull();
    expect(
      checkInAccountSummary({
        detail: "insurance",
        account: { provider: " ", number: null, expires_on: null },
        proposed: { provider: "Aqua", number: null, expires_on: null },
      }),
    ).toBeNull();
  });
});

describe("checkInSubmission", () => {
  it("sends every fact not kept, trimmed, with an emptied one as null", () => {
    const values = {
      ...checkInProposalValues(details),
      phone: "  +44 3 ",
      insurance_provider: "",
    };
    expect(checkInSubmission(details, new Set(), values)).toEqual({
      born_on: "1988-04-02",
      phone: "+44 3",
      emergency_contact: { name: "Alex", phone: "0456", relationship: null },
      insurance: null,
    });
  });

  it("leaves a kept fact out altogether, which is what keeps the account's", () => {
    const submission = checkInSubmission(
      details,
      new Set(["phone", "insurance"] as const),
      checkInProposalValues(details),
    );
    expect(Object.keys(submission)).toEqual(["born_on", "emergency_contact"]);
  });

  it("sends nothing for a fact the document does not carry", () => {
    expect(
      checkInSubmission(
        [details[1]],
        new Set(),
        checkInProposalValues(details),
      ),
    ).toEqual({ phone: "+44 2" });
  });
});

describe("checkInWasWritten", () => {
  const report = (codes: string[]): ImportReport => ({
    collections: [],
    files: { referenced: 0, restored: 0, not_contained: 0, skipped: 0 },
    notes: codes.map((code) => ({
      code: code as ImportReport["notes"][number]["code"],
      collection: null,
      uuid: null,
      message: "",
    })),
    notes_truncated: 0,
    conversion: null,
  });

  it("is true only when the apply says a fact was written", () => {
    expect(checkInWasWritten(report(["check_in_detail_written"]))).toBe(true);
    expect(
      checkInWasWritten(
        report([
          "check_in_detail_dropped",
          "diver_not_applied",
          "portrait_kept",
        ]),
      ),
    ).toBe(false);
  });
});

describe("portraitChoice", () => {
  const sha = "a".repeat(64);

  it("carries the preview's digest whichever way the diver chose", () => {
    const offer = { account_sha256: sha, proposed: "data:image/webp;base64," };
    expect(portraitChoice(offer, false)).toEqual({
      choice: "take",
      account_sha256: sha,
    });
    expect(portraitChoice(offer, true)).toEqual({
      choice: "keep",
      account_sha256: sha,
    });
    // No portrait on the account is `null`, sent rather than left out.
    expect(
      portraitChoice({ ...offer, account_sha256: null }, true),
    ).toHaveProperty("account_sha256", null);
  });

  it("sends nothing when nothing was offered", () => {
    expect(portraitChoice(null, false)).toBeUndefined();
  });
});
