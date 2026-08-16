import { Skeleton } from "@/components/ui/skeleton";

/**
 * The loading state for the dashboard's two chart cards. Both are a row of
 * summary figures over a `720 x 240` SVG drawn at `w-full h-auto`, so the
 * placeholder reserves the same `3:1` box - a card that collapsed to a spinner
 * and then grew back to chart height was most of what made arriving at the
 * dashboard feel jumpy.
 *
 * `legend` covers the one difference between them: the gas chart carries a
 * `text-xs` legend under its plot (it doubles as the control for which series
 * are drawn) and the activity chart has nothing there. Its `mt-2` plus line box
 * is 24px, which is exactly how much the gas card was still moving without this.
 */
export function ChartSkeleton({
  stats = 3,
  legend = false,
}: {
  stats?: number;
  legend?: boolean;
}) {
  return (
    <div aria-busy>
      <div className="mb-5 flex flex-wrap items-end gap-x-8 gap-y-3">
        {Array.from({ length: stats }, (_, stat) => (
          <div key={stat}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-1.5 h-7 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="aspect-[3/1] w-full" />
      {legend && <Skeleton className="mt-2 h-4 w-64" />}
    </div>
  );
}
