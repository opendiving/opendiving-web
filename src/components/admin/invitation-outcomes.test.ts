import { describe, expect, it } from "vitest";
import { summarizeInvitationOutcomes } from "./invitation-outcomes";
import type { AdminInvitationOutcome } from "@/lib/api/admin";

const outcome = (
  email: string,
  value: AdminInvitationOutcome["outcome"],
): AdminInvitationOutcome => ({ email, outcome: value });

describe("summarizeInvitationOutcomes", () => {
  it("counts each outcome the API reported", () => {
    expect(
      summarizeInvitationOutcomes([
        outcome("a@example.com", "invited"),
        outcome("b@example.com", "invited"),
        outcome("c@example.com", "already_registered"),
      ]),
    ).toBe("2 invited, 1 already registered");
  });

  it("names only the outcomes that actually occurred", () => {
    expect(
      summarizeInvitationOutcomes([outcome("a@example.com", "invited")]),
    ).toBe("1 invited");
  });

  it("keeps a fixed order rather than the order the addresses came back in", () => {
    // Otherwise the same batch reads differently depending on which address the
    // operator ticked first, which makes two runs look like different results.
    expect(
      summarizeInvitationOutcomes([
        outcome("a@example.com", "mail_failed"),
        outcome("b@example.com", "invited"),
      ]),
    ).toBe("1 invited, 1 created but not emailed");
  });

  it("says an unaccepted invitation was created, not that it was sent", () => {
    // `mail_failed` still admits the address. Reporting it as a failure to
    // invite would have the operator invite again, which changes nothing.
    expect(
      summarizeInvitationOutcomes([outcome("a@example.com", "mail_failed")]),
    ).toBe("1 created but not emailed");
  });

  it("counts an outcome it has no label for under its own name", () => {
    expect(
      summarizeInvitationOutcomes([
        outcome("a@example.com", "invited"),
        // Not in this build's union - an API one version ahead.
        { email: "b@example.com", outcome: "quarantined" } as never,
      ]),
    ).toBe("1 invited, 1 quarantined");
  });
});
