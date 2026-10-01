import { useId } from "react";
import { smoothPath, type Point } from "@/lib/chart-path";
import { cn } from "@/lib/utils";

// The drawing's own units, stretched to whatever box it is given: the curve
// is a shape to recognise, not a chart to read, so neither axis keeps a scale.
const WIDTH = 100;
const HEIGHT = 100;

// A dive's depth curve, in the colour of the card's text, over a fill that
// fades down from it into whatever the shape is drawn over. Each depth is the
// deepest in an even slice of the dive, so the shape reaches the dive's
// maximum; the surface is pinned at both ends, where every dive starts and
// finishes. Draws nothing for a series that never leaves the surface.
//
// The line is its own drawing over the fill's, so a filter the caller hangs on
// it with `lineClassName` - a glow - stays off the fill: a `drop-shadow` over
// the translucent gradient draws it in bands.
export function DiveProfileSilhouette({
  depths,
  className,
  lineClassName,
}: {
  depths: number[];
  className?: string;
  lineClassName?: string;
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
  const drawing = {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    preserveAspectRatio: "none",
    overflow: "visible",
  };

  return (
    <div aria-hidden className={cn("relative text-foreground", className)}>
      <svg {...drawing} className="absolute inset-0 size-full">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${curve} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`}
          fill={`url(#${gradientId})`}
        />
      </svg>
      <svg
        {...drawing}
        className={cn("absolute inset-0 size-full", lineClassName)}
      >
        <path
          d={curve}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
