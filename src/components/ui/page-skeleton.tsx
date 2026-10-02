import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

interface PageSkeletonProps {
  /** Same destination the loaded page's `PageHeader` will use. */
  backHref: string;
  backLabel: string;
}

/**
 * The loading state for the dive form pages, which are a `PageHeader` over a
 * single narrow card of labelled fields.
 */
export function FormPageSkeleton({
  backHref,
  backLabel,
  fields = 6,
}: PageSkeletonProps & { fields?: number }) {
  return (
    <div className="container mx-auto px-4 pt-8 pb-6 max-w-2xl" aria-busy>
      <PageHeader
        backHref={backHref}
        backLabel={backLabel}
        title={<Skeleton className="h-9 w-56" />}
        subtitle={<Skeleton className="h-6 w-64" />}
      />
      <Card className="animate-skeleton-reveal motion-reduce:animate-none">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-6">
          {Array.from({ length: fields }, (_, field) => (
            <div key={field} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
