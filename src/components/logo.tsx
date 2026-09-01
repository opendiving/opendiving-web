import * as React from "react";

/**
 * The OpenDiving brand mark: three bubbles rising left to right, growing as
 * they go, the way real ones do as the pressure drops. Original artwork drawn
 * for this project - it replaced a copy of lucide's `waves-horizontal` icon,
 * which credited nobody and, being a stock icon a dozen other dive apps also
 * reach for, was not a mark this project could ever have claimed as its own
 * (see `DECISIONS.md`). Nothing here is third-party, so `NOTICE.md` has no
 * entry for it.
 *
 * Drawn in the same language as the lucide icons it sits beside - 24x24 box,
 * 2px stroke, round caps - so it reads as part of the same set. `currentColor`
 * means it drops in anywhere an icon would (e.g.
 * `<Logo className="h-8 w-8 text-coral" />`) and follows the active theme.
 * `src/app/icon.svg` is the same three circles at a heavier stroke, which is
 * what keeps the smallest bubble from turning to mush at favicon sizes.
 */
export function Logo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <circle cx="6.5" cy="18.5" r="1.6" />
      <circle cx="11.5" cy="12.5" r="2.6" />
      <circle cx="17" cy="5.5" r="3.4" />
    </svg>
  );
}
