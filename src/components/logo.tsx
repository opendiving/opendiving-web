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
 * The smallest bubble is filled rather than hollow. Its hole was the first
 * thing to close up as the mark got smaller, so it read as a solid dot at
 * favicon sizes and a ring everywhere else; filling it deliberately makes the
 * mark the same shape at every size. The fill sits inside the stroke, so the
 * silhouette is unchanged. `src/app/icon.svg` is the same three circles at a
 * heavier stroke, which is what keeps that bubble crisp at 16px.
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
      <circle cx="6.5" cy="18.5" r="1.6" fill="currentColor" />
      <circle cx="11.5" cy="12.5" r="2.6" />
      <circle cx="17" cy="5.5" r="3.4" />
    </svg>
  );
}

/**
 * The same three bubbles under the name the dive UI reads them by. Wherever the
 * app needs an icon that means *a dive* - the Total Dives figure, the Recent
 * Dives card, "New dive" in the create menu - this is it, and importing `Logo`
 * there would have every one of those call sites claim to be drawing the site's
 * logo. Nothing about the mark changes between the two names; only what it is
 * standing for does.
 *
 * These places drew lucide's `Waves` until the mark stopped being a wave. Water
 * icons still mean water: the Water type field and the dive's Water Type row
 * keep `Waves`, because there the wave is the subject rather than a stand-in for
 * the dive.
 */
export const DiveIcon = Logo;
