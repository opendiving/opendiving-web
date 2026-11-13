"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Check, X } from "lucide-react";
import {
  adminAPI,
  type AdminSpecies,
  type AdminSpeciesPhotoProposal,
} from "@/lib/api/admin";
import { formatDateTime } from "@/lib/date-time";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SpeciesThumbnail } from "@/components/species/species-thumbnail";

// The API's bound on a decline's reason.
const REASON_MAX_LENGTH = 500;

/**
 * One species' waiting proposals as last read. `count` is the row's
 * `photo_proposals_waiting` when the read began, so a row whose count has moved
 * since is read again; `stale` asks for that without the count moving.
 */
export type ProposalRead =
  | { state: "failed"; count: number; stale?: boolean }
  | {
      state: "loaded";
      count: number;
      proposals: AdminSpeciesPhotoProposal[];
      stale?: boolean;
    };

/** Whether the row's proposals are still to be read, or are being read. */
export const isReadPending = (
  row: AdminSpecies,
  read: ProposalRead | undefined,
) =>
  row.photo_proposals_waiting > 0 &&
  (!read || read.stale === true || read.count !== row.photo_proposals_waiting);

// Reads the proposals of every listed species that has one waiting, one species
// at a time: each read has the API ask Wikimedia about every proposed file, and
// what keeps those previews off any rate counter is that one operator reads them
// at one operator's pace. A ref is the guard, so an effect run while a read is
// out starts nothing; the read's answer changes `reads`, which runs it again.
export function useSpeciesPhotoProposalReads(species: AdminSpecies[]) {
  const [reads, setReads] = useState<Record<string, ProposalRead>>({});
  const inFlight = useRef(false);

  useEffect(() => {
    if (inFlight.current) return;
    const row = species.find((candidate) =>
      isReadPending(candidate, reads[candidate.uuid]),
    );
    if (!row) return;

    inFlight.current = true;
    const { uuid, photo_proposals_waiting: count } = row;
    const settle = (read: ProposalRead) => {
      inFlight.current = false;
      setReads((current) => ({ ...current, [uuid]: read }));
    };
    adminAPI.getSpeciesPhotoProposals(uuid).then(
      (proposals) => settle({ state: "loaded", count, proposals }),
      (error: unknown) => {
        console.error("Couldn't read the photo proposals.", error);
        settle({ state: "failed", count });
      },
    );
  }, [species, reads]);

  // Asks for the species' proposals to be read again once its turn comes.
  const reread = useCallback((uuid: string) => {
    setReads((current) => {
      const read = current[uuid];
      return read ? { ...current, [uuid]: { ...read, stale: true } } : current;
    });
  }, []);

  return { reads, reread };
}

/** The decision in flight on one proposal. */
export interface ProposalDeciding {
  proposal: string;
  action: "accept" | "decline";
}

interface SpeciesPhotoProposalsProps {
  species: AdminSpecies;
  read: ProposalRead | undefined;
  /** True while any action on this species is in flight. */
  disabled: boolean;
  deciding: ProposalDeciding | null;
  onAccept: (proposal: AdminSpeciesPhotoProposal) => void;
  onDecline: (proposal: AdminSpeciesPhotoProposal) => void;
  onRetry: () => void;
}

function Photo({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="min-w-0">
      <div className="aspect-[4/3] w-full overflow-hidden rounded-md bg-muted">
        {children}
      </div>
      <figcaption className="pt-1 text-xs text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

function ProposalTile({
  species,
  proposal,
  disabled,
  deciding,
  onAccept,
  onDecline,
}: {
  species: AdminSpecies;
  proposal: AdminSpeciesPhotoProposal;
  disabled: boolean;
  deciding: ProposalDeciding["action"] | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const credit = [proposal.license, proposal.author].filter(Boolean);

  return (
    <li
      className="flex min-w-0 flex-col gap-2 rounded-md border p-2"
      aria-label={`Proposed by ${proposal.proposer_name}`}
    >
      <div className="grid grid-cols-2 gap-2">
        <Photo caption="Current">
          <SpeciesThumbnail
            uuid={species.uuid}
            photoSha256={species.photo_sha256}
            className="h-full w-full rounded-none"
          />
        </Photo>
        <Photo caption="Proposed">
          {/* A `data:` URI the API fetched, so nothing here asks Wikimedia for
              anything. A missing one keeps its box. */}
          {proposal.preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proposal.preview}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </Photo>
      </div>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        <div className="break-words text-foreground">{proposal.file}</div>
        <div>
          {proposal.proposer_name}, {formatDateTime(proposal.created_at)}
        </div>
        {proposal.note && (
          <p className="whitespace-pre-line break-words text-sm text-foreground">
            {proposal.note}
          </p>
        )}
        {credit.length > 0 && (
          <div className="break-words">{credit.join(" · ")}</div>
        )}
      </div>
      <div className="mt-auto flex flex-wrap gap-1">
        <Button size="sm" disabled={disabled} onClick={onAccept}>
          {deciding === "accept" ? (
            <ButtonSpinner className="mr-1" />
          ) : (
            <Check className="h-4 w-4 mr-1" aria-hidden />
          )}
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={onDecline}
        >
          {deciding === "decline" ? (
            <ButtonSpinner className="mr-1" />
          ) : (
            <X className="h-4 w-4 mr-1" aria-hidden />
          )}
          Decline
        </Button>
      </div>
    </li>
  );
}

// The photos proposed for one species, each beside the one it would replace.
export function SpeciesPhotoProposals({
  species,
  read,
  disabled,
  deciding,
  onAccept,
  onDecline,
  onRetry,
}: SpeciesPhotoProposalsProps) {
  let body: React.ReactNode;
  if (!read || isReadPending(species, read)) {
    body = (
      <p role="status" className="text-sm text-muted-foreground">
        Reading the proposals…
      </p>
    );
  } else if (read.state === "failed") {
    body = (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        The proposals could not be read.
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  } else if (read.proposals.length === 0) {
    body = (
      <p className="text-sm text-muted-foreground">
        No proposal waits any more.
      </p>
    );
  } else {
    body = (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {read.proposals.map((proposal) => (
          <ProposalTile
            key={proposal.uuid}
            species={species}
            proposal={proposal}
            disabled={disabled}
            deciding={
              deciding?.proposal === proposal.uuid ? deciding.action : null
            }
            onAccept={() => onAccept(proposal)}
            onDecline={() => onDecline(proposal)}
          />
        ))}
      </ul>
    );
  }

  return (
    <section className="space-y-2 border-t p-3" aria-label="Photo proposals">
      <h3 className="text-sm font-medium">Proposed photos</h3>
      {body}
    </section>
  );
}

interface DeclineProposalDialogProps {
  proposal: AdminSpeciesPhotoProposal | null;
  onClose: () => void;
  onDecline: (proposal: AdminSpeciesPhotoProposal, reason: string) => void;
}

// Keyed by the proposal at the call site, so each starts with an empty reason.
export function DeclineProposalDialog({
  proposal,
  onClose,
  onDecline,
}: DeclineProposalDialogProps) {
  const [reason, setReason] = useState("");

  return (
    <ConfirmDialog
      open={proposal !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Decline this photo"
      description={
        proposal
          ? `${proposal.file} will not be proposed for this species again. The proposer can read your reason.`
          : undefined
      }
      confirmText="Decline"
      onConfirm={() => {
        if (proposal) onDecline(proposal, reason.trim());
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="photo-proposal-decline-reason">Reason (optional)</Label>
        <Textarea
          id="photo-proposal-decline-reason"
          value={reason}
          maxLength={REASON_MAX_LENGTH}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}
