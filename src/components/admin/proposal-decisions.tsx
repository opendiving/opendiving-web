"use client";

import { useState } from "react";

import { CommonsCredit } from "@/components/sites/commons-site";
import { SharedMembersForm } from "@/components/sites/shared-members-form";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormApiError } from "@/components/ui/form-api-error";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  adminAPI,
  type AdminDiveSiteProposal,
  type DiveSiteProposalAccept,
} from "@/lib/api/admin";
import {
  diveSitesAPI,
  sharedMembersOf,
  type DiveSiteSharedMembers,
} from "@/lib/api/dive-sites";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api/error";

// The API's bound on a reason.
const REASON_MAX_LENGTH = 2000;

/**
 * How a decision ended the review: it was made, or the proposal turned out not to
 * be there to decide - withdrawn, replaced by a newer one, or decided in another tab.
 */
export type ProposalOutcome =
  | { kind: "decided"; title: string; description: string }
  | { kind: "gone"; description: string };

interface DecisionProps {
  proposal: AdminDiveSiteProposal;
  onClose: () => void;
  onSettled: (outcome: ProposalOutcome) => void;
}

/** A Commons record a new site can be folded into, with the credit it shows under. */
export interface AcceptIntoTarget {
  uuid: string;
  name: string;
  attribution: string | null;
}

function useDecide({ onSettled }: Pick<DecisionProps, "onSettled">) {
  const [apiError, setApiError] = useState<string | null>(null);

  const decide = async (
    request: Promise<void>,
    decided: Omit<Extract<ProposalOutcome, { kind: "decided" }>, "kind">,
    failure: string,
  ) => {
    setApiError(null);
    try {
      await request;
      onSettled({ kind: "decided", ...decided });
    } catch (error) {
      const message = getApiErrorMessage(error, failure);
      const status = getApiErrorStatus(error);
      if (status === 404 || status === 409) {
        onSettled({ kind: "gone", description: message });
      } else {
        // A 422 names the record rule the body broke, for the reviewer to fix here.
        setApiError(message);
      }
    }
  };

  return { apiError, setApiError, decide };
}

const accepted = (description: string) => ({
  title: "Proposal accepted",
  description,
});

// Plain accept: the whole record, started from what was proposed.
export function AcceptDialog({ proposal, onClose, onSettled }: DecisionProps) {
  const { apiError, decide } = useDecide({ onSettled });

  const submit = (members: DiveSiteSharedMembers) =>
    decide(
      adminAPI.acceptDiveSiteProposal(proposal.uuid, { members }),
      accepted(`${members.name} is in the Commons as you left it.`),
      "Failed to accept the proposal. Please try again.",
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept this proposal</DialogTitle>
          <DialogDescription>
            What is here is what the Commons publishes, whatever the diver has
            edited since.
          </DialogDescription>
        </DialogHeader>
        <SharedMembersForm
          members={proposal.proposed}
          onSubmit={submit}
          onCancel={onClose}
          submitLabel="Accept"
          error={apiError}
        />
      </DialogContent>
    </Dialog>
  );
}

// Folding a new site into a record leaves the record as it stands unless the
// reviewer asks to change it, and then the form starts from the record's own read:
// never from `proposed`, which would write the proposer's site over it, and never
// from a match row, which lacks half the members.
export function AcceptIntoDialog({
  proposal,
  target,
  onClose,
  onSettled,
}: DecisionProps & { target: AcceptIntoTarget }) {
  const { apiError, setApiError, decide } = useDecide({ onSettled });
  const [isAccepting, setIsAccepting] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [record, setRecord] = useState<DiveSiteSharedMembers | null>(null);

  const accept = (body: DiveSiteProposalAccept) =>
    decide(
      adminAPI.acceptDiveSiteProposal(proposal.uuid, body),
      accepted(`It is folded into ${target.name}.`),
      "Failed to accept the proposal. Please try again.",
    );

  const acceptAsItStands = async () => {
    setIsAccepting(true);
    await accept({ into: target.uuid });
    setIsAccepting(false);
  };

  const readRecord = async () => {
    setApiError(null);
    setIsReading(true);
    try {
      setRecord(sharedMembersOf(await diveSitesAPI.getDiveSite(target.uuid)));
    } catch (error) {
      setApiError(
        getApiErrorMessage(error, "Failed to read that Commons site."),
      );
    } finally {
      setIsReading(false);
    }
  };

  const busy = isAccepting || isReading;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept into {target.name}</DialogTitle>
          <DialogDescription>
            The diver&rsquo;s dives, notes and tags move to this record, and
            their own site is deleted.
          </DialogDescription>
        </DialogHeader>
        <CommonsCredit attribution={target.attribution} />
        {record ? (
          <SharedMembersForm
            members={record}
            onSubmit={(members) => accept({ into: target.uuid, members })}
            onCancel={onClose}
            submitLabel="Accept with these changes"
            error={apiError}
          />
        ) : (
          <>
            <FormApiError error={apiError} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={readRecord}
              >
                {isReading && <ButtonSpinner />}
                Change the record too
              </Button>
              <Button type="button" disabled={busy} onClick={acceptAsItStands}>
                {isAccepting && <ButtonSpinner />}
                Accept
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DeclineDialog({ proposal, onClose, onSettled }: DecisionProps) {
  const { apiError, decide } = useDecide({ onSettled });
  const [reason, setReason] = useState("");
  const [isDeclining, setIsDeclining] = useState(false);

  const decline = async () => {
    setIsDeclining(true);
    await decide(
      adminAPI.declineDiveSiteProposal(proposal.uuid, reason.trim()),
      { title: "Proposal declined", description: "The diver can read why." },
      "Failed to decline the proposal. Please try again.",
    );
    setIsDeclining(false);
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Decline this proposal"
      description="The diver reads your reason on the site and in their list of proposals."
      confirmText="Decline"
      isLoading={isDeclining}
      confirmDisabled={!reason.trim()}
      onConfirm={decline}
    >
      <div className="space-y-2">
        <Label htmlFor="decline-reason">Reason</Label>
        <Textarea
          id="decline-reason"
          value={reason}
          maxLength={REASON_MAX_LENGTH}
          onChange={(event) => setReason(event.target.value)}
        />
        <FormApiError error={apiError} />
      </div>
    </ConfirmDialog>
  );
}
