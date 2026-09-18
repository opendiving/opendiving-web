"use client";

import { Mail, Trash2 } from "lucide-react";
import type { AdminInviteRequest } from "@/lib/api/admin";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { InviteRequestsTable } from "@/components/admin/invite-requests-table";
import { DEFAULT_ITEMS_PER_PAGE } from "@/hooks/useInfiniteResource";

/**
 * Mirrors `MAX_ADDRESSES_PER_BATCH` in the API's invitation schema, which both
 * batch routes enforce with a 422 rather than a partial send.
 *
 * The queue accumulates as it is scrolled, so a select-all after enough
 * scrolling can reach every row the operator has passed. The number is stated
 * here because the API publishes no endpoint that states it; if it ever moves,
 * this is the second place. It sits beside the toolbar that says it out loud, so
 * the cap and the sentence stating it cannot drift apart.
 */
export const MAX_SELECTED = 100;

const noop = () => {};

export interface InviteQueueFrameProps {
  isLoading: boolean;
  totalCount: number;
  itemsPerPage?: number;
  requests?: AdminInviteRequest[];
  selected?: string[];
  onToggle?: (email: string, checked: boolean) => void;
  onToggleAll?: () => void;
  isActing?: boolean;
  onAct?: (action: "invite" | "remove") => void;
  isLoadingMore?: boolean;
  loadFailed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

// Everything /admin/invites draws before the queue exists, kept apart from the data render so
// the page's first render is this frame. Every data-varying prop is optional,
// and the defaults are that first render.
export function InviteQueueFrame({
  isLoading,
  totalCount,
  itemsPerPage = DEFAULT_ITEMS_PER_PAGE,
  requests = [],
  selected = [],
  onToggle = noop,
  onToggleAll = noop,
  isActing = false,
  onAct = noop,
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
}: InviteQueueFrameProps) {
  const count = selected.length;
  const addresses = `${count} ${count === 1 ? "address" : "addresses"}`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Invite Queue</h1>
        <p className="text-muted-foreground mt-2">
          Addresses that have asked for an invitation to this instance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle
            as="h2"
            className="flex items-center justify-between gap-4"
          >
            <span>Requests</span>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="pending request"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              onClick={() => onAct("invite")}
              disabled={count === 0 || isActing}
            >
              <Mail className="h-4 w-4 mr-2" />
              Send invitations
            </Button>
            <Button
              variant="outline"
              onClick={() => onAct("remove")}
              disabled={count === 0 || isActing}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </Button>
            <span
              className="text-sm text-muted-foreground self-center"
              // Ticking a row is a pointer gesture with no announcement of its
              // own, so the running total is spoken as it changes. The select-all's
              // `indeterminate` dash carries the same news, and a screen reader does
              // read it - a native checkbox exposes the mixed state - but only to
              // someone who goes back to the header box for it. This region is the
              // half that arrives unasked.
              aria-live="polite"
            >
              {count === 0
                ? "Nothing selected"
                : count >= MAX_SELECTED
                  ? `${addresses} selected - the most one batch can hold`
                  : `${addresses} selected`}
            </span>
          </div>

          <InviteRequestsTable
            requests={requests}
            isLoading={isLoading}
            itemsPerPage={itemsPerPage}
            selected={selected}
            onToggle={onToggle}
            onToggleAll={onToggleAll}
          />

          {/* No selection reset here, unlike the Previous/Next footer this
              replaced: that cleared the ticks because a page turn carried the
              selected addresses off screen, and sending invitations the operator
              can no longer see is the thing it was guarding against. Loading
              more only appends, so everything ticked stays visible. */}
          <LoadMoreTrigger
            hasMore={hasMore}
            isLoading={isLoadingMore}
            hasFailed={loadFailed}
            loadedCount={requests.length}
            totalCount={totalCount}
            itemsPerPage={itemsPerPage}
            itemLabel="requests"
            onLoadMore={onLoadMore}
          />
        </CardContent>
      </Card>
    </div>
  );
}
