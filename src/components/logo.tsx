import * as React from "react";

/**
 * The OpenDiving brand mark: matches the original lucide "Waves" icon
 * exactly (same viewBox, paths, and default stroke attributes), just as
 * a self-contained SVG so it doesn't depend on the lucide-react package.
 * Drawn with `currentColor`, so it drops in anywhere an icon would (e.g.
 * `<Logo className="h-8 w-8 text-coral" />`) and follows the active
 * theme's color automatically.
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
