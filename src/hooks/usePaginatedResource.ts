"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";

export interface PaginatedResponse<T> {
  data: T[];
  total_count: number;
  has_more: boolean;
}

interface UsePaginatedResourceOptions {
  itemsPerPage?: number;
  errorMessage?: string;
  /** Skip fetching until this becomes true (e.g. while waiting for `user`). */
  enabled?: boolean;
}

// Shared pagination + fetch-on-mount logic for the dives/trips/sites list
// pages (and any other page listing a paginated resource). `fetchFn` should
// be a stable (useCallback'd) function performing the actual API request for
// a given page, typically closing over the current user.
export function usePaginatedResource<T>(
  fetchFn: (page: number, perPage: number) => Promise<PaginatedResponse<T>>,
  {
    itemsPerPage = 10,
    errorMessage = "Failed to load data. Please try again.",
    enabled = true,
  }: UsePaginatedResourceOptions = {},
) {
  const { toast } = useToast();
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(
    async (page: number = 1) => {
      try {
        setIsLoading(true);
        const response = await fetchFn(page, itemsPerPage);

        setItems(response.data);
        setTotalCount(response.total_count);
        setHasMore(response.has_more);
        setCurrentPage(page);
      } catch (error) {
        console.error(errorMessage, error);
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFn, itemsPerPage, toast, errorMessage],
  );

  useEffect(() => {
    // Deliberate fetch-on-mount pattern (setIsLoading(true) runs synchronously
    // before the network await). This is a known, contentious false-positive for
    // react-hooks/set-state-in-effect - see https://github.com/facebook/react/issues/34743.
    if (enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchPage();
    }
  }, [enabled, fetchPage]);

  const refetch = useCallback(
    () => fetchPage(currentPage),
    [fetchPage, currentPage],
  );

  return {
    items,
    isLoading,
    totalCount,
    currentPage,
    itemsPerPage,
    hasMore,
    fetchPage,
    refetch,
  };
}
