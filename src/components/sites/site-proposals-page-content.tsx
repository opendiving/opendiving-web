"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Card, CardContent } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ListCardHeader,
  useIsEmptyList,
} from "@/components/ui/list-card-header";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { HERO_BODY, IndexHero, PAGE_COLUMN } from "@/components/ui/map-hero";
import { NotFoundState } from "@/components/ui/not-found-state";
import { PageSpinner } from "@/components/ui/page-spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { useToast } from "@/components/ui/use-toast";
import { WAITING_FOR_REVIEW } from "@/components/sites/site-commons-notices";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import {
  DEFAULT_ITEMS_PER_PAGE,
  useInfiniteResource,
} from "@/hooks/useInfiniteResource";
import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import {
  diveSitesAPI,
  type DiveSiteProposal,
  type DiveSiteProposalKind,
  type DiveSiteProposalStatus,
} from "@/lib/api/dive-sites";
import { getApiErrorMessage } from "@/lib/api/error";
import { formatDateTime } from "@/lib/date-time";

const noop = () => {};

const COLUMNS = 4;

const KIND_LABELS: Record<DiveSiteProposalKind, string> = {
  new_site: "New site",
  change: "Change",
};

const STATUS_LABELS: Record<DiveSiteProposalStatus, string> = {
  waiting: WAITING_FOR_REVIEW,
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

interface SiteProposalsFrameProps {
  isLoading: boolean;
  totalCount: number;
  proposals?: DiveSiteProposal[];
  isLoadingMore?: boolean;
  loadFailed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  withdrawingId?: string | null;
  onWithdraw?: (proposal: DiveSiteProposal) => void;
}

// Everything /sites/proposals draws before the list exists: the defaults are the
// page's first render.
function SiteProposalsFrame({
  isLoading,
  totalCount,
  proposals = [],
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
  withdrawingId = null,
  onWithdraw = noop,
}: SiteProposalsFrameProps) {
  const withReturnTo = useWithReturnTo();
  const isEmptyList = useIsEmptyList({
    isLoading,
    count: proposals.length,
    isNarrowed: false,
  });

  return (
    <div>
      <IndexHero
        title="Your Proposals"
        description="What you have proposed for OpenDiving Commons, and what became of it."
      />

      <div className={HERO_BODY}>
        <Card>
          <ListCardHeader title="Proposals" isEmpty={isEmptyList}>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="proposal"
            />
          </ListCardHeader>
          <CardContent>
            {isEmptyList ? (
              <EmptyState
                icon={Landmark}
                title="No proposals yet"
                description="Choose Public in the form that adds or edits one of your dive sites, or propose a site or a change to a Commons site from the site's own page."
              />
            ) : (
              <Table aria-busy={proposals.length === 0 || undefined}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Proposed</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.length === 0 ? (
                    <TableRowsSkeleton
                      columns={COLUMNS}
                      rows={DEFAULT_ITEMS_PER_PAGE}
                    />
                  ) : (
                    proposals.map((proposal) => (
                      <TableRow key={proposal.uuid}>
                        <TableCell>
                          <Link
                            href={withReturnTo(`/sites/${proposal.site.uuid}`)}
                            className="underline hover:text-muted-foreground"
                          >
                            {proposal.site.name}
                          </Link>
                        </TableCell>
                        <TableCell>{KIND_LABELS[proposal.kind]}</TableCell>
                        <TableCell>
                          {formatDateTime(proposal.created_at, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {STATUS_LABELS[proposal.status]}
                          {proposal.reason && (
                            <p className="whitespace-pre-wrap text-muted-foreground">
                              {proposal.reason}
                            </p>
                          )}
                          {proposal.status === "waiting" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-1 block"
                              disabled={withdrawingId === proposal.uuid}
                              onClick={() => onWithdraw(proposal)}
                            >
                              {withdrawingId === proposal.uuid && (
                                <ButtonSpinner />
                              )}
                              Withdraw
                            </Button>
                          )}
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
              itemsPerPage={DEFAULT_ITEMS_PER_PAGE}
              itemLabel="proposals"
              onLoadMore={onLoadMore}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// The diver's proposals with their outcomes. The routes behind it answer only where
// the Commons is edited, so anywhere else there is no such page.
export function SiteProposalsPageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const { config, isLoading: isConfigLoading } = useInstanceConfig();
  const { toast } = useToast();
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const isPrimary = config?.commons_primary === true;

  const fetchProposals = useCallback(
    (page: number, perPage: number) =>
      diveSitesAPI.getDiveSiteProposals(page, perPage),
    [],
  );
  const {
    items: proposals,
    isLoading,
    isLoadingMore,
    totalCount,
    hasMore,
    loadFailed,
    loadMore,
    applySaved,
  } = useInfiniteResource<DiveSiteProposal>(fetchProposals, {
    keyOf: (proposal) => proposal.uuid,
    enabled: !!user && isPrimary,
    errorMessage: "Failed to load your proposals. Please try again.",
  });

  const withdraw = async (proposal: DiveSiteProposal) => {
    setWithdrawingId(proposal.uuid);
    try {
      await diveSitesAPI.withdrawDiveSiteProposal(proposal.uuid);
      applySaved({ ...proposal, status: "withdrawn" });
    } catch (error) {
      toast({
        title: getApiErrorMessage(
          error,
          "Failed to withdraw your proposal. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setWithdrawingId(null);
    }
  };

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  if (!isConfigLoading && !isPrimary) {
    return (
      <div className={PAGE_COLUMN}>
        <NotFoundState
          message="This copy takes no proposals."
          backHref="/sites"
          backLabel="Back to dive sites"
        />
      </div>
    );
  }

  return (
    <SiteProposalsFrame
      isLoading={isLoading}
      totalCount={totalCount}
      proposals={proposals}
      isLoadingMore={isLoadingMore}
      loadFailed={loadFailed}
      hasMore={hasMore}
      onLoadMore={loadMore}
      withdrawingId={withdrawingId}
      onWithdraw={(proposal) => void withdraw(proposal)}
    />
  );
}
