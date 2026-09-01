"use client";

import { useId } from "react";

// The landing hero's background: a dive profile, drawn as the cross-section a
// diver would recognise from their computer - a fast descent, a long bottom
// phase that shallows as the reef does, the ascent, three minutes at five
// metres, and the surface. Original artwork for this project, in the same
// stroke language as the brand mark (`components/logo.tsx`) and the lucide
// icons around it: round caps, no fills except the wash. The three coral
// bubbles rising from the deepest point are the mark itself, so the one warm
// accent in the drawing is the logo. It replaced a marketplace reef drawing
// this repository was not licensed to redistribute - see "The brand mark is
// original now, and marketplace artwork cannot ship here" in DECISIONS.md.
//
// Sized to sit under the hero grid rather than behind it: the surface line
// lands just below the heading column and the sign-in card, and the profile
// runs under the short paragraph beneath them, with the bottom phase kept
// below that paragraph's last line and the bubbles to its left at the widths
// the two-column layout exists at. Hidden below `lg` for the same reason the
// original accent was: stacked, the text and the drawing would share the same
// column.
//
// `xMidYMax meet` with `overflow-visible` is what makes one drawing work at
// every width. The profile keeps its proportions and stays centred under the
// centred content, and the surface line and the wash - drawn far past the
// viewBox on both sides - reach the section's edges on any screen, where the
// section's own `overflow-x-hidden` clips them.
export function HeroBackdrop({ className }: { className?: string }) {
  const washId = useId();

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1200 210"
      preserveAspectRatio="xMidYMax meet"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={washId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* The water: a wash that is strongest at the surface and gone by the
          bottom edge, so the section below starts on a clean background. */}
      <rect
        x="-2400"
        y="10"
        width="6000"
        height="200"
        fill={`url(#${washId})`}
      />
      <g stroke="currentColor" strokeWidth="2.5">
        {/* The surface, as one low wave repeated across the width. */}
        <path
          opacity="0.35"
          d="M-2400 10q40 -7 80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0"
        />
        {/* The profile. */}
        <path
          opacity="0.6"
          d="M100 10C140 12 170 150 205 188C225 200 245 202 265 200C330 194 400 190 470 178C540 166 610 160 680 150C740 142 800 138 840 120C870 106 885 48 915 42C945 38 985 38 1020 40C1040 40 1052 14 1072 10"
        />
      </g>
      {/* The mark: three bubbles leaving the deepest point of the dive. */}
      <g className="text-coral" stroke="currentColor" strokeWidth="2.5" opacity="0.85">
        <circle cx="268" cy="176" r="4" />
        <circle cx="283" cy="152" r="6.5" />
        <circle cx="302" cy="122" r="8.5" />
      </g>
    </svg>
  );
}
