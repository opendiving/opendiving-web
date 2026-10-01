"use client";

import type { CSSProperties, Ref } from "react";
import { Attribution } from "@/components/attribution";
import { useConfig } from "@/contexts/ConfigContext";
import { cn } from "@/lib/utils";

// The basemap's credit, a licence condition of drawing it: over the map it
// credits, or on the surface laid over a map that leaves it to that surface. Its
// own module so a surface can carry it without loading the map.
export function MapCredit({
  className,
  style,
  ref,
}: {
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
}) {
  // From the instance's runtime configuration, as the map's style is.
  const { basemap } = useConfig();
  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        "bg-background/80 px-1 text-[10px] leading-4 text-muted-foreground",
        className,
      )}
    >
      <Attribution value={basemap.attribution} underline={false} />
    </div>
  );
}
