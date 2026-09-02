import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface CountBadgeProps {
  count: number;
  /** True while the count is still being fetched. */
  isLoading: boolean;
  /** Singular noun for the thing counted, e.g. "total dive", "certification". */
  label: string;
  /**
   * The plural, where adding an "s" does not produce it. "species" is its own
   * plural, and the default would render "24 speciess".
   */
  plural?: string;
}

/**
 * The "N total dives" badge on a list card's title.
 *
 * It exists because of the skeleton rows below it. `totalCount` is 0 until the
 * first response lands, and while the body was a spinner nobody ever read the
 * badge - but a card that is holding its full shape and showing ten placeholder
 * rows *under* the words "0 total dives" is stating something untrue, clearly.
 *
 * The placeholder is `h-4` to match the badge's `text-xs` line box, so the badge
 * is the same height counting nothing as it is counting something.
 */
export function CountBadge({
  count,
  isLoading,
  label,
  plural = `${label}s`,
}: CountBadgeProps) {
  // `count === 0` as well as `isLoading`, so paging through a loaded list keeps
  // showing the total it already knows instead of blinking it away and back.
  // A genuinely empty list is never loading by the time it renders as empty.
  const isUnknown = isLoading && count === 0;

  return (
    <Badge variant="secondary">
      {isUnknown ? (
        <Skeleton className="h-4 w-16" />
      ) : (
        `${count} ${count === 1 ? label : plural}`
      )}
    </Badge>
  );
}
