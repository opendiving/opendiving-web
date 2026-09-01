import * as React from "react";

/**
 * The OpenDiving brand mark: matches lucide's `waves-horizontal` icon
 * exactly (same viewBox, paths, and default stroke attributes), just as
 * a self-contained SVG so it doesn't depend on the lucide-react package.
 * `Waves` is that icon's older name and is now an alias re-export of it,
 * so importing either from lucide-react draws these same three paths.
 * Drawn with `currentColor`, so it drops in anywhere an icon would (e.g.
 * `<Logo className="h-8 w-8 text-coral" />`) and follows the active
 * theme's color automatically.
 *
 * Copied artwork, so it carries lucide's copyright: ISC License, Copyright
 * (c) Lucide Icons and Contributors. Full text, and why the copy exists at
 * all, in this repository's `NOTICE.md`. `src/app/icon.svg` is the same three
 * paths again, for the favicon.
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
      <path d="M2 12q2.5 2 5 0t5 0 5 0 5 0" />
      <path d="M2 19q2.5 2 5 0t5 0 5 0 5 0" />
      <path d="M2 5q2.5 2 5 0t5 0 5 0 5 0" />
    </svg>
  );
}
