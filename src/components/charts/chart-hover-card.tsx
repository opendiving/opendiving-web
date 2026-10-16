"use client";

import { type ReactNode, useRef } from "react";
import { CHART_HEIGHT } from "@/lib/chart-scale";
import { useKeepInside } from "@/hooks/useKeepInside";

// The hover card's surface, for every chart's card.
//
// Never a hover target itself - it sits over the marks, and letting it take the
// pointer would make it flicker as it steals its own trigger's hover.
// `bg-tooltip`, not `bg-popover`: popover is the *same* color as the card it
// would be floating on in both themes, leaving a 1px border to do all the
// separating, which over a chart's own marks isn't enough. The border is a light
// hairline rather than `--border` for the same reason - on a near-black chip the
// theme's border color disappears in light mode and merges with it in dark.
export const CHART_HOVER_CARD =
  "pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-white/10 bg-tooltip px-3 py-2 text-tooltip-foreground shadow-lg";

export interface ChartHoverCardProps {
  // The mark it describes, in the chart's viewBox.
  cx: number;
  cy: number;
  // The chart's viewBox width, from `useChartWidth`.
  chartWidth: number;
  children: ReactNode;
}

// A hover card for a chart drawn in the shared `CHART_HEIGHT` frame, placed at
// a mark. HTML rather than SVG `<text>` so it gets the app's tokens, a border, a
// shadow and crisp text at any chart width; HTML rather than an SVG `<title>`,
// which only a mouse can ever open.
//
// Positioned in percentages of the chart box, which works because the SVG scales
// uniformly inside a wrapper of exactly its size, so viewBox units map straight
// onto percentages without measuring anything in the DOM. The `style` prop is an
// inline style *attribute*, which the CSP allows (`style-src-attr
// 'unsafe-inline'`); an injected `<style>` element would not be.
export function ChartHoverCard({
  cx,
  cy,
  chartWidth,
  children,
}: ChartHoverCardProps) {
  // Flipped and nudged so the card lands inside the chart box rather than over
  // the card's header or, on a phone, past the screen's edge. `useKeepInside`
  // pulls back in whatever a phone-width chart still leaves hanging over.
  const cardRef = useRef<HTMLDivElement>(null);
  useKeepInside(cardRef);
  const below = cy < CHART_HEIGHT * 0.35;
  const translateY = below ? "12px" : "calc(-100% - 12px)";
  const translateX =
    cx < chartWidth * 0.18
      ? "-12px"
      : cx > chartWidth * 0.82
        ? "calc(-100% + 12px)"
        : "-50%";

  return (
    <div
      ref={cardRef}
      className={CHART_HOVER_CARD}
      style={{
        left: `${(cx / chartWidth) * 100}%`,
        top: `${(cy / CHART_HEIGHT) * 100}%`,
        transform: `translate(${translateX}, ${translateY})`,
      }}
      role="presentation"
    >
      {children}
    </div>
  );
}
