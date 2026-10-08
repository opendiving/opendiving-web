import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DiveIcon } from "@/components/logo";
import { FORM_BODY, PlainHeroSkeleton } from "@/components/ui/map-hero";
import { Skeleton } from "@/components/ui/skeleton";

interface PageSkeletonProps {
  /** Same destination the loaded page's `PlainHero` will use. */
  backHref: string;
  backLabel: string;
}

/**
 * The loading state for the dive form pages, which are a `PlainHero` over a
 * single narrow card of labelled fields.
 */
export function FormPageSkeleton({
  backHref,
  backLabel,
  fields = 6,
}: PageSkeletonProps & { fields?: number }) {
  return (
    <div aria-busy>
      <PlainHeroSkeleton
        backHref={backHref}
        backLabel={backLabel}
        icon={DiveIcon}
        figureless
      />
      <div className={FORM_BODY}>
        <Card className="animate-skeleton-reveal motion-reduce:animate-none">
          <CardHeader>
            <Skeleton className="h-6 w-40 max-sm:h-4.5" />
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
    </div>
  );
}
