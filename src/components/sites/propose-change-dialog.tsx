"use client";

import { useState } from "react";
import { CommonsAttestation } from "@/components/sites/commons-attestation";
import { SharedMembersForm } from "@/components/sites/shared-members-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  changedMembers,
  COMMONS_ATTESTATIONS,
  diveSitesAPI,
  sharedMembersOf,
  type DiveSite,
  type DiveSiteProposal,
  type DiveSiteSharedMembers,
} from "@/lib/api/dive-sites";
import { getApiErrorMessage } from "@/lib/api/error";

interface ProposeChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The Commons record.
  site: DiveSite;
  onProposed: (proposal: DiveSiteProposal) => void;
}

function ProposeChangeForm({
  site,
  onCancel,
  onProposed,
}: {
  site: DiveSite;
  onCancel: () => void;
  onProposed: (proposal: DiveSiteProposal) => void;
}) {
  const [ticked, setTicked] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = async (members: DiveSiteSharedMembers) => {
    const changed = changedMembers(sharedMembersOf(site), members);
    if (Object.keys(changed).length === 0) {
      setError("This changes nothing on the Commons site.");
      return;
    }
    setError(null);
    try {
      onProposed(
        await diveSitesAPI.proposeDiveSite(site.uuid, {
          attestation: COMMONS_ATTESTATIONS.change,
          message,
          members: changed,
        }),
      );
    } catch (failure) {
      setError(
        getApiErrorMessage(
          failure,
          "Failed to send your proposal. Please try again.",
        ),
      );
    }
  };

  return (
    <SharedMembersForm
      members={sharedMembersOf(site)}
      onSubmit={send}
      onCancel={onCancel}
      submitLabel="Send proposal"
      submitDisabled={!ticked}
      error={error}
    >
      <CommonsAttestation
        kind="change"
        ticked={ticked}
        onTickedChange={setTicked}
        message={message}
        onMessageChange={setMessage}
      />
    </SharedMembersForm>
  );
}

// A change to a Commons record: its shared members for editing, then the attestation.
// The record stays as it is for everyone, the proposer included, until a reviewer
// accepts. Only what differs is sent, which is what the review marks as changed.
export function ProposeChangeDialog({
  open,
  onOpenChange,
  site,
  onProposed,
}: ProposeChangeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propose a change</DialogTitle>
          <DialogDescription>
            Everyone goes on seeing this site as it is until a reviewer accepts
            the change. An accepted change is public and stays, whatever becomes
            of your account, and it is published without your name.
          </DialogDescription>
        </DialogHeader>
        <ProposeChangeForm
          site={site}
          onCancel={() => onOpenChange(false)}
          onProposed={(proposal) => {
            onProposed(proposal);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
