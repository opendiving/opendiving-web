import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A grey placeholder standing in for content that hasn't arrived, shaped and
 * sized like the thing it replaces so nothing moves when the real content
 * lands. Prefer this to a spinner anywhere the final layout is predictable -
 * a spinner collapses the region it sits in and the page jumps twice.
 *
 * Rendered as a `<span class="block">` rather than a `<div>` on purpose: it
 * lays out identically, and it stays valid inside the `<p>` and `<h1>` that
 * `PageHeader` puts its subtitle and title in.
 *
 * `aria-hidden` because the region it fills should carry `aria-busy` instead -
 * announcing a dozen empty boxes tells a screen reader user nothing.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden
      className={cn(
        "block rounded-md bg-muted animate-skeleton motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A card-shaped placeholder built from the real `Card` primitives, so its
 * padding and border match the card that replaces it exactly. `lines` is the
 * number of body rows to draw - roughly how many fields the real card shows.
 */
export function CardSkeleton({
  lines = 5,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: lines }, (_, line) => (
          <Skeleton
            key={line}
            // Every bar the same width reads as a table, not as prose. Cycling
            // three widths by index keeps it varied without any randomness,
            // which would differ between the server and client renders.
            className={cn("h-4", ["w-full", "w-11/12", "w-2/3"][line % 3])}
          />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Placeholder rows for the bordered-row lists (recent dives, recent trips) -
 * a label and a sub-label on the left, one figure on the right, inside the
 * same `p-3 rounded-lg border` box the real rows use.
 */
export function ListRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex items-center justify-between gap-4 p-3 rounded-lg border"
        >
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}
