import { type ReactNode } from "react";

import { CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
