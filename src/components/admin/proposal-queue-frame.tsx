"use client";

import { Landmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ListCardHeader,
  useIsEmptyList,
} from "@/components/ui/list-card-header";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { DEFAULT_ITEMS_PER_PAGE } from "@/hooks/useInfiniteResource";
import type { AdminDiveSiteProposal } from "@/lib/api/admin";
import type { DiveSiteProposalKind } from "@/lib/api/dive-sites";
import {
  daysBetweenIsoDates,
  formatDateTime,
  formatDaysAgo,
  todayIsoDate,
} from "@/lib/date-time";

const noop = () => {};

const COLUMNS = 4;

export const PROPOSAL_QUEUE_TITLE = "Commons Proposals";
export const PROPOSAL_QUEUE_DESCRIPTION =
  "Dive sites and changes divers have proposed for OpenDiving Commons.";

export const PROPOSAL_KIND_LABELS: Record<DiveSiteProposalKind, string> = {
  new_site: "New site",
  change: "Change",
};

/** What a proposal is on: the record's own name for a change, which may rename it. */
export const proposalSiteName = (proposal: AdminDiveSiteProposal) =>
  proposal.kind === "change" ? proposal.current.name : proposal.proposed.name;

/** How long a proposal has waited. */
export const proposalAge = (createdAt: string) =>
  formatDaysAgo(daysBetweenIsoDates(createdAt.slice(0, 10), todayIsoDate()));

export interface ProposalQueueFrameProps {
  isLoading: boolean;
  totalCount: number;
  itemsPerPage?: number;
  proposals?: AdminDiveSiteProposal[];
  onOpen?: (uuid: string) => void;
  isLoadingMore?: boolean;
  loadFailed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

// Everything /admin/proposals draws before the queue exists, as `InviteQueueFrame`
// is for the invite queue: the defaults are the page's first render.
export function ProposalQueueFrame({
  isLoading,
  totalCount,
  itemsPerPage = DEFAULT_ITEMS_PER_PAGE,
  proposals = [],
  onOpen = noop,
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
}: ProposalQueueFrameProps) {
  const isEmptyList = useIsEmptyList({
    isLoading,
    count: proposals.length,
    isNarrowed: false,
  });

  return (
    <div>
      <IndexHero
        title={PROPOSAL_QUEUE_TITLE}
        description={PROPOSAL_QUEUE_DESCRIPTION}
      />

      <div className={HERO_BODY}>
        <Card>
          <ListCardHeader title="Proposals" isEmpty={isEmptyList}>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="waiting proposal"
            />
          </ListCardHeader>
          <CardContent>
            {isEmptyList ? (
              <EmptyState
                icon={Landmark}
                title="No proposals are waiting"
                description="What divers propose for OpenDiving Commons shows up here."
              />
            ) : (
              <Table aria-busy={proposals.length === 0 || undefined}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Proposer</TableHead>
                    <TableHead>Proposed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.length === 0 ? (
                    <TableRowsSkeleton columns={COLUMNS} rows={itemsPerPage} />
                  ) : (
                    proposals.map((proposal) => (
                      <TableRow key={proposal.uuid}>
                        <TableCell>
                          <Button
                            variant="link"
                            className="h-auto p-0 text-left whitespace-normal"
                            onClick={() => onOpen(proposal.uuid)}
                          >
                            {proposalSiteName(proposal)}
                          </Button>
                        </TableCell>
                        <TableCell>
                          {PROPOSAL_KIND_LABELS[proposal.kind]}
                        </TableCell>
                        <TableCell>{proposal.proposer.name}</TableCell>
                        <TableCell title={formatDateTime(proposal.created_at)}>
                          {proposalAge(proposal.created_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}

            <LoadMoreTrigger
              hasMore={hasMore}
              isLoading={isLoadingMore}
              hasFailed={loadFailed}
              loadedCount={proposals.length}
              totalCount={totalCount}
              itemsPerPage={itemsPerPage}
              itemLabel="proposals"
              onLoadMore={onLoadMore}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
