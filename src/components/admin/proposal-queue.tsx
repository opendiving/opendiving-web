"use client";

import { useCallback, useState } from "react";

import { ProposalQueueFrame } from "@/components/admin/proposal-queue-frame";
import { ProposalReview } from "@/components/admin/proposal-review";
import type { ProposalOutcome } from "@/components/admin/proposal-decisions";
import { NotFoundState } from "@/components/ui/not-found-state";
import { PAGE_COLUMN } from "@/components/ui/map-hero";
import { useToast } from "@/components/ui/use-toast";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import { adminAPI, type AdminDiveSiteProposal } from "@/lib/api/admin";

/**
 * The queue exists only where the Commons is edited: everywhere else its routes are
 * a 404, so it is not asked for, and the page answers as a page that is not there
 * does. A failed config read answers the same, the queue's routes being on the API
 * that just failed.
 */
export function ProposalQueue() {
  const { config, isLoading } = useInstanceConfig();

  if (isLoading) return <ProposalQueueFrame isLoading totalCount={0} />;

  if (!config?.commons_primary) {
    return (
      <div className={PAGE_COLUMN}>
        <NotFoundState
          message="Page not found."
          backHref="/admin"
          backLabel="Back to admin"
        />
      </div>
    );
  }

  return <PrimaryProposalQueue />;
}

// There is no read of one proposal, so opening one is a matter of which loaded row
// is on screen rather than a route of its own.
function PrimaryProposalQueue() {
  const { toast } = useToast();
  const [openUuid, setOpenUuid] = useState<string | null>(null);

  // Stable, for the reason `InviteQueue` gives.
  const fetchProposals = useCallback(
    (page: number, perPage: number) =>
      adminAPI.getDiveSiteProposals(page, perPage),
    [],
  );

  const {
    items: proposals,
    isLoading,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    reload,
    removeItem,
  } = useInfiniteResource<AdminDiveSiteProposal>(fetchProposals, {
    keyOf: (proposal) => proposal.uuid,
    errorMessage: "Failed to load the proposals. Please try again.",
  });

  const settle = (uuid: string, outcome: ProposalOutcome) => {
    setOpenUuid(null);
    if (outcome.kind === "decided") {
      removeItem(uuid);
      toast({ title: outcome.title, description: outcome.description });
      return;
    }
    // Withdrawn, replaced or decided elsewhere, so the row on screen is stale and
    // what else moved is not known.
    toast({
      title: "Error",
      description: outcome.description,
      variant: "destructive",
    });
    void reload();
  };

  const open = proposals.find((proposal) => proposal.uuid === openUuid);
  if (open) {
    return (
      <ProposalReview
        key={open.uuid}
        proposal={open}
        onBack={() => setOpenUuid(null)}
        onSettled={(outcome) => settle(open.uuid, outcome)}
      />
    );
  }

  return (
    <ProposalQueueFrame
      isLoading={isLoading}
      totalCount={totalCount}
      itemsPerPage={itemsPerPage}
      proposals={proposals}
      onOpen={setOpenUuid}
      isLoadingMore={isLoadingMore}
      loadFailed={loadFailed}
      hasMore={hasMore}
      onLoadMore={loadMore}
    />
  );
}
