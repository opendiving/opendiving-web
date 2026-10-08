"use client";

import type { Ref } from "react";
import { Attribution } from "@/components/attribution";
import { useConfig } from "@/contexts/ConfigContext";
import { cn } from "@/lib/utils";

// The basemap's credit, a licence condition of drawing it: over the map it
// credits, or on the surface laid over a map that leaves it to that surface. Its
// own module so a surface can carry it without loading the map.
export function MapCredit({
  className,
  ref,
  value,
}: {
  className?: string;
  ref?: Ref<HTMLDivElement>;
  // A map's own credit, where it is not drawn from this instance's basemap.
  value?: string;
}) {
  // From the instance's runtime configuration, as the map's style is.
  const { basemap } = useConfig();
  return (
    <div
      ref={ref}
      className={cn(
        "bg-background/80 px-1 text-[10px] leading-4 text-muted-foreground",
        className,
      )}
    >
      <Attribution value={value ?? basemap.attribution} underline={false} />
    </div>
  );
}
