"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// `ssr: false` and lazy for the reasons `LocationsMap`'s wrapper gives; the
// placeholder's height is the map's own, so the page does not jump.
export const ProposalMap = dynamic(() => import("./proposal-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full border sm:h-96" />,
});
