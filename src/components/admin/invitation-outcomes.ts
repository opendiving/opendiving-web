import type {
  AdminInvitationOutcome,
  InvitationOutcome,
} from "@/lib/api/admin";

// How each outcome reads in a sentence. Written to be true of the *address*,
// not of the instance: the batch route works whatever the instance's
// registration mode is, so nothing here may imply that signing up needs an
// invitation.
//
// `mail_failed` says "created" on purpose. The invitation row is committed by
// the time the send is attempted and the address is admitted either way, so the
// operator's move is to reach that person another way rather than to invite
// them again.
const OUTCOME_LABELS: Record<InvitationOutcome, string> = {
  invited: "invited",
  already_registered: "already registered",
  already_invited: "already invited",
  mail_failed: "created but not emailed",
};

const KNOWN_OUTCOMES = Object.keys(OUTCOME_LABELS) as InvitationOutcome[];

/**
 * Turns a batch response into the one line the operator reads: "4 invited,
 * 1 already registered".
 *
 * Counted from the **response**, never from the request. The two disagree by
 * design - an address that already has an account or a live invitation is
 * reported rather than invited - so a summary computed from what was selected
 * would confidently state something the API did not do.
 *
 * An outcome this build has no label for is counted under its own wire name
 * instead of being dropped: an API that grows a fifth outcome should read oddly
 * here, not silently go missing from the count.
 */
export function summarizeInvitationOutcomes(
  results: AdminInvitationOutcome[],
): string {
  const counts = new Map<string, number>();
  for (const result of results) {
    counts.set(result.outcome, (counts.get(result.outcome) ?? 0) + 1);
  }

  const ordered = [
    ...KNOWN_OUTCOMES.filter((outcome) => counts.has(outcome)),
    ...[...counts.keys()].filter(
      (outcome) => !KNOWN_OUTCOMES.includes(outcome as InvitationOutcome),
    ),
  ];

  return ordered
    .map(
      (outcome) =>
        `${counts.get(outcome)} ${
          OUTCOME_LABELS[outcome as InvitationOutcome] ?? outcome
        }`,
    )
    .join(", ");
}
