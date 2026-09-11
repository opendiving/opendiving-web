"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { useNearViewport } from "@/hooks/useNearViewport";

interface LoadMoreTriggerProps {
  hasMore: boolean;
  /** True while the next page is in flight. */
  isLoading: boolean;
  /** How many rows are on screen now. */
  loadedCount: number;
  totalCount: number;
  /** Page size, used only to stay silent about a list that fits on one page. */
  itemsPerPage: number;
  /** Plural label for the items being listed, e.g. "dives", "trips". */
  itemLabel: string;
  onLoadMore: () => void;
}

/**
 * End-of-list marker for the continuously-loading lists: a progress line and a
 * "Load more" button that loads itself as it scrolls into view.
 *
 * The button is the sentinel, rather than a bare `<div>` beside one. Auto-load
 * on scroll is invisible to a screen reader and unreachable by keyboard - there
 * is nothing to tab to - so a list with rows past the first page would simply
 * end for anyone not using a mouse. Making the focusable control the observed
 * element means a pointer user never sees it fire (it loads while still below
 * the fold) and everyone else has a real button. The progress line is a live
 * region for the same reason: appended rows are otherwise a silent change.
 *
 * Renders nothing for a list that fits on one page, which is what the
 * Previous/Next footer this replaced did.
 */
export function LoadMoreTrigger({
  hasMore,
  isLoading,
  loadedCount,
  totalCount,
  itemsPerPage,
  itemLabel,
  onLoadMore,
}: LoadMoreTriggerProps) {
  const [sentinelRef, isNear] = useNearViewport<HTMLDivElement>();

  useEffect(() => {
    if (isNear && hasMore && !isLoading) onLoadMore();
    // Re-runs when `isLoading` settles, so a page that lands without pushing the
    // button back off screen - a short page, or a tall viewport - pulls the next
    // one straight after it instead of stalling until the diver scrolls again.
  }, [isNear, hasMore, isLoading, onLoadMore]);

  if (totalCount === 0) return null;
  if (!hasMore && loadedCount <= itemsPerPage) return null;

  return (
    <div className="flex flex-col items-center gap-3 mt-6">
      <p className="text-sm text-muted-foreground" role="status">
        {hasMore
          ? `Showing ${loadedCount} of ${totalCount} ${itemLabel}`
          : `All ${totalCount} ${itemLabel} loaded`}
      </p>
      {hasMore && (
        <div ref={sentinelRef}>
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <ButtonSpinner />
                Loading...
              </span>
            ) : (
              `Load more ${itemLabel}`
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
