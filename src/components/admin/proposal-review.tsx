"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";

import {
  AcceptDialog,
  AcceptIntoDialog,
  DeclineDialog,
  type AcceptIntoTarget,
  type ProposalOutcome,
} from "@/components/admin/proposal-decisions";
import { ProposalMap } from "@/components/admin/proposal-map-lazy";
import {
  openStreetMapPinHref,
  pinMoveMetres,
  reviewMarkers,
} from "@/components/admin/proposal-markers";
import { ProposalMatches } from "@/components/admin/proposal-matches";
import { ProposalMembers } from "@/components/admin/proposal-members";
import {
  PROPOSAL_KIND_LABELS,
  PROPOSAL_QUEUE_DESCRIPTION,
  PROPOSAL_QUEUE_TITLE,
  proposalAge,
  proposalSiteName,
} from "@/components/admin/proposal-queue-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";
import { useUnits } from "@/hooks/useUnits";
import type { AdminDiveSiteProposal } from "@/lib/api/admin";
import { countNoun } from "@/lib/format";
import { formatDistance } from "@/lib/geo-distance";

type Decision =
  | { kind: "accept" }
  | { kind: "decline" }
  | { kind: "into"; target: AcceptIntoTarget };

interface ProposalReviewProps {
  proposal: AdminDiveSiteProposal;
  onBack: () => void;
  onSettled: (outcome: ProposalOutcome) => void;
}

// One proposal: the map, and beside it what a reviewer weighs. Everything shown of a
// private site comes from the row's allow-listed members.
export function ProposalReview({
  proposal,
  onBack,
  onSettled,
}: ProposalReviewProps) {
  const units = useUnits();
  const [decision, setDecision] = useState<Decision | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // The list this replaces may have been scrolled, and the row that opened this is
  // gone: focus carries both the reader and the viewport here.
  useEffect(() => heading.current?.focus(), []);

  const markers = useMemo(
    () => reviewMarkers(proposal, units),
    [proposal, units],
  );
  const moved = pinMoveMetres(proposal);
  const { proposer, message } = proposal;
  const decisionProps = {
    proposal,
    onClose: () => setDecision(null),
    onSettled,
  };

  return (
    <div>
      <IndexHero
        title={PROPOSAL_QUEUE_TITLE}
        description={PROPOSAL_QUEUE_DESCRIPTION}
      />

      <div className={HERO_BODY}>
        <Button variant="ghost" size="sm" className="mb-4" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to the queue
        </Button>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2
            ref={heading}
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            {proposalSiteName(proposal)}
          </h2>
          <Badge variant="outline">{PROPOSAL_KIND_LABELS[proposal.kind]}</Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            {markers.length > 0 ? (
              <>
                <ProposalMap markers={markers} />
                {moved !== null && (
                  <p className="text-sm">
                    The pin moves {formatDistance(moved, units)}.
                  </p>
                )}
                <a
                  href={openStreetMapPinHref(markers[0])}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm underline hover:text-foreground"
                >
                  Open the pin on OpenStreetMap
                  <ExternalLink aria-hidden className="h-3 w-3" />
                </a>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This proposal has no pin to show.
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-6">
            <section className="space-y-1 text-sm">
              <h3 className="text-base font-semibold">{proposer.name}</h3>
              <p className="text-muted-foreground">
                {countNoun(proposer.accepted_count, "proposal")} accepted,{" "}
                {proposer.declined_count} declined. This one was proposed{" "}
                {proposalAge(proposal.created_at)}.
              </p>
              {message && <p className="whitespace-pre-wrap">{message}</p>}
            </section>

            <ProposalMatches
              proposal={proposal}
              onAcceptInto={({ uuid, name, attribution }) =>
                setDecision({
                  kind: "into",
                  target: { uuid, name, attribution },
                })
              }
            />

            <ProposalMembers proposal={proposal} />

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setDecision({ kind: "accept" })}>
                Accept
              </Button>
              <Button
                variant="outline"
                onClick={() => setDecision({ kind: "decline" })}
              >
                Decline
              </Button>
            </div>
          </div>
        </div>
      </div>

      {decision?.kind === "accept" && <AcceptDialog {...decisionProps} />}
      {decision?.kind === "decline" && <DeclineDialog {...decisionProps} />}
      {decision?.kind === "into" && (
        <AcceptIntoDialog {...decisionProps} target={decision.target} />
      )}
    </div>
  );
}
