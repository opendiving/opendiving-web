"use client";

import type { ReactNode } from "react";
import Link from "next/link";

interface NotificationRowProps {
  title: string;
  // The item's own page, which the title links to.
  href: string;
  subtitle: string | null;
  badge: ReactNode;
  // What the badge leaves unsaid: "by 40 days", "on Oct 23, 2026".
  qualifier: string;
  // Names the row's button, which is the rest of the row and opens the form that deals
  // with the item. Read out, not shown: the row it covers is its sighted label, and a
  // hover hint would sit over the row above.
  actionLabel: string;
  onAction: () => void;
  // Called as the title's link is followed, so whatever holds the row can close.
  onNavigate: () => void;
}

/**
 * One row of the notifications bell: the title and its subtitle on the left, the
 * badge and its qualifier on the right, and each pair on one line.
 *
 * The row is two controls. The button is stretched over the whole row rather than
 * wrapping it, because a link inside a button is invalid, and the title's link is
 * lifted above it - so a click on the title goes to the item and a click anywhere
 * else opens its form. On touch the title's line is 44px tall and underlined,
 * since a finger has no hover to show which words are the link.
 *
 * The right column is as wide as its badge, so the badges end on one line down both
 * sections whatever each one says, with the qualifier centred under its badge.
 */
export function NotificationRow({
  title,
  href,
  subtitle,
  badge,
  qualifier,
  actionLabel,
  onAction,
  onNavigate,
}: NotificationRowProps) {
  return (
    <div className="relative -mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 rounded-md px-2 py-1.5 hover:bg-muted">
      <Link
        href={href}
        onClick={onNavigate}
        // `justify-self-start` keeps the link to its text, so the rest of its cell
        // still opens the form.
        className="relative z-10 justify-self-start text-sm font-medium hover:underline touch:inline-flex touch:min-h-11 touch:items-center touch:underline touch:underline-offset-4"
      >
        {title}
      </Link>
      <div className="justify-self-center">{badge}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
      <div className="justify-self-center text-center text-xs text-muted-foreground">
        {qualifier}
      </div>
      <button
        type="button"
        onClick={onAction}
        className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="sr-only">{actionLabel}</span>
      </button>
    </div>
  );
}
