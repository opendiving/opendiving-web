"use client";

import { useState, type CSSProperties } from "react";
import { routeHoldDelayMs } from "@/lib/route-hold";

/**
 * The `--skeleton-delay` a placeholder should animate on, or `undefined` when
 * nothing is holding one and the flat 150ms in `tailwind.config.mts` applies.
 *
 * Read once, when the placeholder mounts, and never recomputed: the delay is an
 * offset from *this* element's insertion, so freezing it is what makes every
 * placeholder in a navigation - the fallback's and the page's alike - reveal at
 * the same moment measured from the click. Re-reading it on a later render would
 * retarget an animation already running and step its opacity.
 */
export function useSkeletonHold(): CSSProperties | undefined {
  const [style] = useState(skeletonHoldStyle);
  return style;
}

function skeletonHoldStyle(): CSSProperties | undefined {
  const delay = routeHoldDelayMs();
  if (delay === null) return undefined;
  return { "--skeleton-delay": `${Math.round(delay)}ms` } as CSSProperties;
}
