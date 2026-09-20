"use client";

import { useState, type ReactNode } from "react";

import { CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface IsEmptyListInput {
  /** Whether the first page of the list is still in flight. */
  isLoading: boolean;
  /** How many rows - or cards - are on screen. */
  count: number;
  /** Whether a search term or a filter is selecting what the list shows. */
  isNarrowed: boolean;
}

/**
 * Whether a list card has nothing to head: no rows, nothing loading, and nothing
 * narrowing it - which a search cleared a moment ago still counts as, until the
 * rows catch up with it.
 *
 * A term and the rows it selects do not change in the same commit: the page's
 * debounce clears the term, and the fetch that refills the list only starts in
 * the effect after that render. For that one render a search cleared after
 * matching nothing looks exactly like a list that was always empty, and dropping
 * the header there pulls the box out from under the diver mid-clear, taking the
 * cursor with it and, under `sm`, folding the box shut.
 */
export function useIsEmptyList({
  isLoading,
  count,
  isNarrowed,
}: IsEmptyListInput): boolean {
  // Latched while rendering rather than in an effect: React re-runs this
  // component before it commits, so the latch is closed in the render that first
  // sees the narrowing and no second paint is charged for it.
  //
  // It opens again the moment the list itself moves - the refetch a cleared term
  // starts raises `isLoading`, and any row arriving says the list is not empty -
  // so it spans the one stale render and not the rest of the visit. Deleting the
  // last row later still drops the header, search or no search.
  const [wasNarrowed, setWasNarrowed] = useState(isNarrowed);
  const narrowed = isNarrowed || (wasNarrowed && !isLoading && count === 0);
  if (narrowed !== wasNarrowed) setWasNarrowed(narrowed);

  return !isLoading && count === 0 && !narrowed;
}

export interface ListCardHeaderProps {
  /** The card's own heading, e.g. "Trip List". Never on screen. */
  title: string;
  /**
   * Whether the list holds nothing at all - which a search or a filter that
   * matched nothing is not. That list is narrowed, and keeps its header.
   */
  isEmpty: boolean;
  /** The count, and whatever narrows it: a search box, a filter button. */
  children: ReactNode;
}

/**
 * The header of a one-list page's card: the count, the controls that narrow it,
 * and a heading only a screen reader gets.
 *
 * The heading is hidden rather than dropped - the page's `h1` names the list,
 * but the card is still a section of it, and the empty state's `h3` below would
 * skip a level without it (`app/list-card-headings.render.test.tsx`).
 *
 * An empty list keeps the heading and loses the rest, padding included, so the
 * empty state below is the top of the card: "0 total trips" beside a box that
 * would search nothing is furniture around the one sentence worth reading. A
 * list *searched* down to nothing keeps both - there the count is the answer,
 * and the box is the way back out.
 */
export function ListCardHeader({
  title,
  isEmpty,
  children,
}: ListCardHeaderProps) {
  return (
    <CardHeader className={cn(isEmpty && "p-0")}>
      <CardTitle as="h2" className="sr-only">
        {title}
      </CardTitle>
      {/* `flex-wrap` is what gives an opened search box its own line under
          `sm`, where it and the count do not fit on one. */}
      {!isEmpty && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {children}
        </div>
      )}
    </CardHeader>
  );
}
