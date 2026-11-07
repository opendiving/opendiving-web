"use client";

import { useCallback } from "react";
import Link from "next/link";

import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import {
  logbookImportAPI,
  type LogbookImportSummary,
} from "@/lib/api/logbook-import";
import { formatDateTime } from "@/lib/date-time";
import { importCountsSentence } from "@/lib/logbook-import";

// The applied imports, newest first, page by page so that an older one stays
// reachable. Absent until there is one to list.
export function ImportHistory() {
  const withReturnTo = useWithReturnTo();
  const fetchImports = useCallback(
    (page: number, perPage: number) => logbookImportAPI.list(page, perPage),
    [],
  );
  const {
    items,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
  } = useInfiniteResource<LogbookImportSummary>(fetchImports, {
    keyOf: (item) => item.uuid,
    errorMessage: "Failed to load your previous imports. Please try again.",
  });

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="import-history-heading" className="space-y-3">
      <h2 id="import-history-heading" className="text-lg font-semibold">
        Previous Imports
      </h2>
      <ul className="divide-y divide-border rounded-md border">
        {items.map((item) => (
          <li key={item.uuid}>
            <Link
              href={withReturnTo(`/import/${item.uuid}`)}
              className="block px-3 py-2 hover:bg-muted/50"
            >
              <span className="block text-sm font-medium">
                {formatDateTime(item.applied_at)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {importCountsSentence(item.counts)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <LoadMoreTrigger
        hasMore={hasMore}
        isLoading={isLoadingMore}
        hasFailed={loadFailed}
        loadedCount={items.length}
        totalCount={totalCount}
        itemsPerPage={itemsPerPage}
        itemLabel="imports"
        onLoadMore={loadMore}
      />
    </section>
  );
}
