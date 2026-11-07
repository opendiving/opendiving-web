import { Skeleton } from "@/components/ui/skeleton";

// Where an import's page has its import to wait for: the first render, before the
// page knows whether it is a picker or a review.
export function ImportBodySkeleton() {
  return (
    <div aria-busy className="space-y-3">
      <div aria-hidden className="space-y-3">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}
