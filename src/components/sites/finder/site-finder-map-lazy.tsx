"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// The finder's map, fetched in the browser: MapLibre needs a WebGL2 context and
// a real element, and has no business in the bundle until the map is drawn.
export const SiteFinderMap = dynamic(() => import("./site-finder-map"), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0 rounded-[inherit]" />,
});
