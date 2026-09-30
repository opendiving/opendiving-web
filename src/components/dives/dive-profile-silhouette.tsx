import { useId } from "react";
import { smoothPath, type Point } from "@/lib/chart-path";
import { cn } from "@/lib/utils";

// The drawing's own units, stretched to whatever box it is given: the curve
// is a shape to recognise, not a chart to read, so neither axis keeps a scale.
const WIDTH = 100;
const HEIGHT = 100;

// A dive's depth curve over a fill that fades down from it into whatever the
// shape is drawn over. Each depth is the deepest in an even slice of the dive,
// so the shape reaches the dive's maximum; the surface is pinned at both ends,
// where every dive starts and finishes. Draws nothing for a series that never
// leaves the surface.
export function DiveProfileSilhouette({
  depths,
  className,
}: {
  depths: number[];
  className?: string;
}) {
  const gradientId = useId();
  const deepest = Math.max(0, ...depths);
  if (deepest === 0) return null;

  const points: Point[] = [
    { x: 0, y: 0 },
    ...depths.map((depth, index) => ({
      x: ((index + 0.5) / depths.length) * WIDTH,
      y: (depth / deepest) * HEIGHT,
    })),
    { x: WIDTH, y: 0 },
  ];
  const curve = smoothPath(points);

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      overflow="visible"
      className={cn("text-muted-foreground", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${curve} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`}
        fill={`url(#${gradientId})`}
      />
      <path
        d={curve}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
