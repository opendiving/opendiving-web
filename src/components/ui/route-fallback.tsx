"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  beginRouteHold,
  expireRouteHold,
  resumeRouteHold,
} from "@/lib/route-hold";

/**
 * Wraps what a `loading.tsx` draws, and is the only place the route hold is
 * opened. Every segment's fallback renders one.
 *
 * The hold opens during this component's first render, which is the click: a
 * new loading boundary mounts as the navigation starts, so a timestamp taken
 * here is the moment the diver acted rather than a frame the browser got round
 * to. It closes when the fallback unmounts, which is the commit that mounts the
 * page - by then the page has rendered and taken the remaining delay, and
 * nothing that mounts afterwards should have it.
 *
 * Renders no element of its own: the fallback's first child is the destination's
 * own outermost node, and a wrapper here would be a box the page does not have.
 */
export function RouteFallback({ children }: { children: ReactNode }) {
  useState(openHold);

  useEffect(() => {
    // Development's remount tears this down and runs it again on a fallback
    // that never left the screen; without the resume, the page arriving behind
    // it would find the hold closed.
    resumeRouteHold();
    return expireRouteHold;
  }, []);

  return <>{children}</>;
}

function openHold(): null {
  beginRouteHold();
  return null;
}
