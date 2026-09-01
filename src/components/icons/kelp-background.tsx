import * as React from "react";

/**
 * Decorative kelp illustration used as a background accent on the landing
 * hero. Original artwork drawn for this project - it replaced a reef line-art
 * SVG bought from a marketplace, whose licence covered personal projects and
 * physical products but not redistribution of the file, which is exactly what
 * publishing this repository does (see `DECISIONS.md`). Nothing here is
 * third-party, so `NOTICE.md` has no entry for it.
 *
 * Drawn in the same language as the brand mark - open curves, round caps, no
 * closed shapes - because the two are seen together. That is also what makes
 * it survive its own rendering: it ships faint, behind live copy, where
 * discrete objects need detail to be legible and detail is the first thing
 * opacity destroys. Earlier attempts with tube sponges and a sea fan read as a
 * bar chart and a shield respectively.
 *
 * It hangs off the bottom of the hero as a wide band rather than sitting in
 * the middle of it. The reef it replaced was centred, and the same slot put
 * this one's seabed line straight through a line of the paragraph - flowing
 * blades pass behind text far better than a hard horizontal rule does.
 *
 * `currentColor` throughout, so the colour comes from the class (`text-teal`).
 */
export function KelpBackground({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 200"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M8 184c34-6 66-8 100-4s76 6 124-3" />
      <path d="M34 182c-6-28 2-52 20-70" />
      <path d="M46 182c-4-24 3-45 17-60" />
      <path d="M60 182c-2-34 6-62 24-84" />
      <path d="M74 182c0-22 5-40 15-54" />
      <path d="M104 182c-3-30 4-55 20-74" />
      <path d="M118 182c-1-20 4-37 13-50" />
      <path d="M148 182c-4-40 4-72 26-98" />
      <path d="M162 182c-2-26 4-48 16-64" />
      <path d="M192 182c-3-24 2-44 16-59" />
      <path d="M204 182c-1-17 3-32 11-43" />
      <circle cx="96" cy="70" r="2.2" />
      <circle cx="103" cy="57" r="3" />
      <circle cx="112" cy="42" r="3.8" />
    </svg>
  );
}
