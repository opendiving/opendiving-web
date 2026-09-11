"use client";

import { useCallback } from "react";
import Link from "next/link";
import { divesAPI, Dive } from "@/lib/api/dives";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { DiveSitesLabel } from "@/components/dives/dive-sites-label";
import {
  formatDiveDateTime,
  formatDurationHoursMinutes,
} from "@/lib/date-time";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListRowsSkeleton } from "@/components/ui/skeleton";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { Plus, Clock, ArrowDownToLine } from "lucide-react";
import { DiveIcon } from "@/components/logo";
import { useUnits } from "@/hooks/useUnits";
import { formatDepth } from "@/lib/units";

const RECENT_DIVES_COUNT = 5;

// The page size for the scoped lists on the detail pages. Ten, like the other
// list pages, rather than the API's 100-row ceiling: the rows are links a reader
// scans, and a first paint of ten arrives sooner than one of a hundred.
const DIVES_PER_PAGE = 10;

export interface RecentDivesCardProps {
  userId: string;
  // Only show dives belonging to this trip. When omitted, shows the user's
  // most recent dives across all trips.
  tripId?: string;
  // Only show dives made at this dive site. When omitted, shows dives
  // regardless of dive site.
  diveSiteId?: string;
  // Only show dives this gear item was used on. When omitted, shows dives
  // regardless of gear.
  gearItemId?: string;
  // Only show dives that were part of this training course. When omitted, shows
  // dives regardless of course.
  courseId?: string;
  // Only show dives that recorded this species. When omitted, shows dives
  // regardless of what was spotted.
  speciesId?: string;
  // Show every dive in scope, a page at a time as the reader scrolls, rather
  // than the dashboard's fixed preview of the latest few.
  //
  // The detail pages used to ask for this with `limit={100}`, meaning "all of
  // them" - and the API clamps `items_per_page` to 100, so a diver past that
  // number was shown a list that looked complete and was not. There is no
  // number to get wrong now.
  complete?: boolean;
  title?: string;
  description?: string;
  // Href/label for the header's "view all" button. Pass `null` to hide it
  // entirely (e.g. when the card already shows the full list).
  viewAllHref?: string | null;
  viewAllLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  newDiveHref?: string;
  newDiveLabel?: string;
}

// Shows a list of dives for a user (dive number, date, duration, max depth).
// Used on the dashboard (the most recent few) and on the detail pages that
// scope dives to one record - a trip, a dive site, a gear item, a course, a
// species - so they all stay in sync.
export function RecentDivesCard({
  userId,
  tripId,
  diveSiteId,
  gearItemId,
  courseId,
  speciesId,
  complete = false,
  title = "Recent Dives",
  description = "Your latest underwater adventures",
  viewAllHref = "/dives",
  viewAllLabel = "View All Dives",
  emptyTitle = "No dives logged yet",
  emptyDescription = "Start your diving journey by logging your first dive!",
  newDiveHref = "/dives/new",
  newDiveLabel = "Log Your First Dive",
}: RecentDivesCardProps) {
  const units = useUnits();

  const fetchDives = useCallback(
    (page: number, perPage: number) =>
      divesAPI.getDives(
        userId,
        page,
        perPage,
        tripId,
        diveSiteId,
        gearItemId,
        courseId,
        speciesId,
      ),
    [userId, tripId, diveSiteId, gearItemId, courseId, speciesId],
  );

  // The preview asks for its few rows once and stops; a complete list pages
  // through in tens. `hasMore` is forced false for the preview so the trigger
  // below renders nothing - the header's "View All Dives" button is where that
  // card's "more" lives, and offering both would be two answers to one question.
  const {
    items: recentDives,
    isLoading: isLoadingDives,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
  } = useInfiniteResource<Dive>(fetchDives, {
    keyOf: (dive) => dive.uuid,
    enabled: !!userId,
    itemsPerPage: complete ? DIVES_PER_PAGE : RECENT_DIVES_COUNT,
    errorMessage: "Failed to load dives. Please try again.",
  });

  return (
    <Card>
      <CardHeader>
        {/* Title and description in one column with the action beside them,
            rather than the description under the whole row: a `size="sm"`
            button is taller than the title, so centring it there pushed the
            description to twice every other card's 6px. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle as="h2" className="flex items-center gap-2">
              <DiveIcon className="h-5 w-5" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {viewAllHref && (
            <Button variant="outline" size="sm" asChild>
              <Link href={viewAllHref}>{viewAllLabel}</Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingDives ? (
          // `RECENT_DIVES_COUNT` either way: on the dashboard it is exactly
          // the preview's size, and on a detail page the real count isn't
          // knowable up front, where a few rows is a better guess than a
          // screen of them.
          <ListRowsSkeleton rows={RECENT_DIVES_COUNT} />
        ) : recentDives.length === 0 ? (
          <div className="text-center py-12">
            <DiveIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {emptyTitle}
            </h3>
            <p className="text-muted-foreground mb-4">{emptyDescription}</p>
            <Button asChild>
              <Link href={newDiveHref}>
                <Plus className="h-4 w-4 mr-2" />
                {newDiveLabel}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {recentDives.map((dive) => (
              <Link
                key={dive.uuid}
                href={`/dives/${dive.uuid}`}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 p-3 rounded-lg border hover:bg-muted transition-colors"
              >
                {/* `min-w-0` so a long site name wraps inside this block rather
                    than squeezing the duration/depth column - the card is half a
                    row wide on the dashboard. */}
                <div className="min-w-0">
                  <div className="font-medium text-foreground">
                    Dive #{dive.dive_number}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="block sm:inline">
                      {formatDiveDateTime(dive.start_time, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {dive.dive_sites.length > 0 && (
                      <span className="block sm:inline">
                        <span className="hidden sm:inline">{" \u00b7 "}</span>
                        <DiveSitesLabel sites={dive.dive_sites} showLocation />
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatDurationHoursMinutes(dive.duration)}
                  </div>
                  <div className="flex items-center gap-1">
                    <ArrowDownToLine className="h-4 w-4" />
                    {/* Whole units in this row, unlike the detail page's two
                        decimals: it is a scanning list, and the second decimal
                        of a depth is not what anyone is scanning for. */}
                    {dive.max_depth
                      ? formatDepth(dive.max_depth, units, { decimals: 0 })
                      : "-"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <LoadMoreTrigger
          hasMore={complete && hasMore}
          isLoading={isLoadingMore}
          hasFailed={loadFailed}
          loadedCount={recentDives.length}
          totalCount={totalCount}
          itemsPerPage={itemsPerPage}
          itemLabel="dives"
          onLoadMore={loadMore}
        />
      </CardContent>
    </Card>
  );
}
