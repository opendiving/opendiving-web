import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";
import { useSkeletonHold } from "@/hooks/useSkeletonHold";

interface PageSkeletonProps {
  /** Same destination the loaded page's `PageHeader` will use. */
  backHref: string;
  backLabel: string;
}

/**
 * The loading state for a detail page, every one of which is a `PageHeader`
 * over the same 2/3 + 1/3 card grid.
 *
 * It renders the *real* back button rather than a placeholder for it: where
 * that link goes is known before the record is, and it's the one control on
 * the page a diver might want during the wait - a mistyped or stale URL
 * otherwise leaves them on a page of grey boxes with nothing to click.
 */
export function DetailPageSkeleton({ backHref, backLabel }: PageSkeletonProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8" aria-busy>
      <PageHeader
        backHref={backHref}
        backLabel={backLabel}
        // Sized to the type they stand in for, measured rather than guessed:
        // `text-3xl` sets a 36px line box and the subtitle's `text-base` a 24px
        // one, so the cards below start at the offset they'll settle at. Every
        // detail page's subtitle is now plain text, the dive page's included -
        // its prev/next pager used to sit in this line and cost it 4px.
        title={<Skeleton className="h-9 w-64" />}
        subtitle={<Skeleton className="h-6 w-44" />}
        actions={
          <>
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CardSkeleton lines={7} />
        </div>
        <div className="space-y-6">
          <CardSkeleton lines={4} />
        </div>
      </div>
    </div>
  );
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
  const hold = useSkeletonHold();
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl" aria-busy>
      <PageHeader
        backHref={backHref}
        backLabel={backLabel}
        title={<Skeleton className="h-9 w-56" />}
        subtitle={<Skeleton className="h-6 w-64" />}
      />
      <Card
        className="animate-skeleton-reveal motion-reduce:animate-none"
        style={hold}
      >
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
