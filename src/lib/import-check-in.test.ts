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
import { EMPTY_CHECKIN_FORM_VALUES } from "@/lib/validations/checkin-details";

const details: ImportCheckInDetail[] = [
  { detail: "email", account: null, proposed: "desk@example.org" },
  { detail: "phone", account: "+44 1", proposed: "+44 2" },
  { detail: "date_of_birth", account: null, proposed: "1988-04-02" },
  {
    detail: "emergency_contacts",
    account: [],
    proposed: [
      { name: "Alex", phone: "0456", relationship: null },
      { name: "Sam", phone: null, relationship: "Parent" },
    ],
  },
  {
    detail: "insurance_policies",
    account: [{ provider: "DAN", number: "P-1", expires_on: "2027-03-01" }],
    proposed: [
      { provider: "DAN", number: "P-1", expires_on: "2027-03-01" },
      { provider: "Aqua", number: null, expires_on: null },
    ],
  },
];

describe("checkInProposalValues", () => {
  it("seeds every member a carried detail holds with the proposal, lists whole", () => {
    expect(checkInProposalValues(details)).toEqual({
      ...EMPTY_CHECKIN_FORM_VALUES,
      email: "desk@example.org",
      date_of_birth: "1988-04-02",
      phone: "+44 2",
      emergency_contacts: [
        { name: "Alex", phone: "0456", relationship: "" },
        { name: "Sam", phone: "", relationship: "Parent" },
      ],
      insurance_policies: [
        { provider: "DAN", number: "P-1", expires_on: "2027-03-01" },
        { provider: "Aqua", number: "", expires_on: "" },
      ],
    });
  });
});

describe("checkInAccountSummary", () => {
  it("reads the account's side as one line, dates formatted, rows apart", () => {
    expect(checkInAccountSummary(details[1])).toBe("+44 1");
    expect(checkInAccountSummary(details[4])).toBe(
      `DAN · P-1 · expires ${formatDateOnly("2027-03-01")}`,
    );
    expect(
      checkInAccountSummary({
        ...details[3],
        account: [
          { name: "Alex", phone: "0456", relationship: null },
          { name: "Sam", phone: null, relationship: "Parent" },
        ],
      } as ImportCheckInDetail),
    ).toBe("Alex · 0456; Sam · Parent");
  });

  it("is null where the account holds nothing of the detail", () => {
    expect(checkInAccountSummary(details[0])).toBeNull();
    expect(checkInAccountSummary(details[2])).toBeNull();
    expect(checkInAccountSummary(details[3])).toBeNull();
  });
});

describe("checkInSubmission", () => {
  it("sends every detail not kept, keyed by its member, trimmed, an emptied one cleared", () => {
    const values = {
      ...checkInProposalValues(details),
      phone: "  +44 3 ",
      insurance_policies: [],
    };
    expect(checkInSubmission(details, new Set(), values)).toEqual({
      email: "desk@example.org",
      phone: "+44 3",
      date_of_birth: "1988-04-02",
      emergency_contacts: [
        { name: "Alex", phone: "0456", relationship: null },
        { name: "Sam", phone: null, relationship: "Parent" },
      ],
      // `[]`, never `null`: the API refuses a list sent as null.
      insurance_policies: [],
    });
  });

  it("leaves a kept detail out altogether, which is what keeps the account's", () => {
    const submission = checkInSubmission(
      details,
      new Set(["phone", "insurance_policies"] as const),
      checkInProposalValues(details),
    );
    expect(Object.keys(submission)).toEqual([
      "email",
      "date_of_birth",
      "emergency_contacts",
    ]);
  });

  it("sends nothing for a detail the document does not carry", () => {
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
    members: [],
    dives: [],
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
