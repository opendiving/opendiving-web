"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ItemActionsMenu } from "@/components/ui/item-actions-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BACKDROP_CARD_LINK,
  LIST_CARD_HOVER,
  LIST_CARD_SURFACE,
} from "@/components/ui/backdrop-card";
import { cn } from "@/lib/utils";

// A card's place while its list loads, at the height of one with a single line
// under its name and one row of figures, 118px, or with no figures, 66px. A list
// item, like the card.
function PlainCardSkeleton({ figureless }: { figureless: boolean }) {
  return (
    <li aria-hidden>
      <Skeleton
        className={cn("rounded-lg", figureless ? "h-16.5" : "h-29.5")}
      />
    </li>
  );
}

// A list of plain cards, as many to a row as fit at 20rem or more - three on a
// wide screen, one on a phone - and spaced as /dives spaces its cards. Until it
// holds a card it draws `placeholders` skeletons, busy and hidden as
// `BackdropCardList`'s are.
export function PlainCardList({
  placeholders = 0,
  figureless = false,
  children = [],
}: {
  placeholders?: number;
  // Whether its cards carry no figures, which sizes the placeholders.
  figureless?: boolean;
  children?: ReactNode[];
}) {
  const isLoading = children.length === 0 && placeholders > 0;
  return (
    <ul
      className="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-4 max-sm:gap-2.5"
      aria-busy={isLoading || undefined}
    >
      {isLoading
        ? Array.from({ length: placeholders }, (_, index) => (
            <PlainCardSkeleton key={index} figureless={figureless} />
          ))
        : children}
    </ul>
  );
}

interface PlainCardProps {
  title: ReactNode;
  // The record's own page. The title links there, stretched over the card.
  href?: string;
  // Chips beside the title.
  badges?: ReactNode;
  // The line under the title.
  line?: ReactNode;
  // Named after the card, as every list's row actions are.
  actionsLabel: string;
  actions: ReactNode;
  // The figures, under the name and its line.
  children?: ReactNode;
}

// A record with nothing to draw behind it, in a list of cards: gear, which has
// no place and no picture, as its page's hero has no band. Drawn as a backdrop
// card's details are - its name, the line under it and its figures - in a list
// card's colour, with its actions in the corner. A list item, so a caller
// renders it in a list.
export function PlainCard({
  title,
  href,
  badges,
  line,
  actionsLabel,
  actions,
  children,
}: PlainCardProps) {
  return (
    // `isolate` keeps the menu's lift over the stretched link inside the card.
    <li
      className={cn(
        "relative isolate rounded-lg border p-3 transition-colors",
        LIST_CARD_SURFACE,
        href && LIST_CARD_HOVER,
      )}
    >
      <div className="absolute right-1 top-1 z-10">
        <ItemActionsMenu label={actionsLabel} variant="ghost" size="sm">
          {actions}
        </ItemActionsMenu>
      </div>
      {/* Clear of the menu in the corner. */}
      <div className="pr-8">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {href ? (
            <Link href={href} className={cn(BACKDROP_CARD_LINK, "min-w-0")}>
              {title}
            </Link>
          ) : (
            <div className="min-w-0 font-medium">{title}</div>
          )}
          {badges}
        </div>
        {line && <div className="text-xs">{line}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </li>
  );
}
