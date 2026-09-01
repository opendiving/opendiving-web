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
      viewBox="0 0 1200 200"
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
        y="6"
        width="6000"
        height="194"
        fill={`url(#${washId})`}
      />
      <g stroke="currentColor" strokeWidth="2.5">
        {/* The surface, as one low wave repeated across the width. */}
        <path
          opacity="0.35"
          d="M-2400 6q40 -7 80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0"
        />
        {/* The profile. */}
        <path
          opacity="0.6"
          d="M100 6C140 8 170 136 205 172C222 182 240 185 258 184C300 182 330 180 365 172C395 166 410 174 445 170C505 162 560 156 615 146C665 136 720 132 760 126C800 120 830 116 848 106C878 90 890 42 918 38C948 34 986 34 1020 36C1040 36 1052 10 1072 6"
        />
      </g>
      {/* The mark: three bubbles leaving the deepest point of the dive. */}
      <g
        className="text-coral"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.85"
      >
        <circle cx="262" cy="162" r="4" />
        <circle cx="277" cy="138" r="6.5" />
        <circle cx="296" cy="108" r="8.5" />
      </g>
    </svg>
  );
}
