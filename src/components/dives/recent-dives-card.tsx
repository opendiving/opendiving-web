"use client";

import { useCallback } from "react";
import Link from "next/link";
import { divesAPI, Dive } from "@/lib/api/dives";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import {
  CARD_TITLE_ACTION,
  CARD_TITLE_ROW,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { BackdropCardSkeleton } from "@/components/ui/backdrop-card";
import { DiveCard } from "@/components/dives/dive-card";
import { Plus } from "lucide-react";
import { DiveIcon } from "@/components/logo";

const RECENT_DIVES_COUNT = 5;

// The page size for the scoped lists on the detail pages. Ten, like the other
// list pages, rather than the API's 100-row ceiling: the rows are links a reader
// scans, and a first paint of ten arrives sooner than one of a hundred.
const DIVES_PER_PAGE = 10;

export interface RecentDivesCardProps {
  // False until there's a signed-in user - the list reads the caller's own log
  // and takes no user uuid, so the page has to say when the session is known.
  enabled: boolean;
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
  // Only show dives that name this person. When omitted, shows dives regardless
  // of who was on them.
  personId?: string;
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

// Shows a list of dives for a user, each as a `DiveCard`.
// Used on the dashboard (the most recent few) and on the detail pages that
// scope dives to one record - a trip, a dive site, a gear item, a course, a
// species, a person - so they all stay in sync.
export function RecentDivesCard({
  enabled,
  tripId,
  diveSiteId,
  gearItemId,
  courseId,
  speciesId,
  personId,
  complete = false,
  title = "Recent Dives",
  description = "Your latest underwater adventures",
  viewAllHref = "/dives",
  viewAllLabel = "View all dives",
  emptyTitle = "No dives logged yet",
  emptyDescription = "Start your diving journey by logging your first dive!",
  newDiveHref = "/dives/new",
  newDiveLabel = "Log your first dive",
}: RecentDivesCardProps) {
  const withReturnTo = useWithReturnTo();
  const fetchDives = useCallback(
    (page: number, perPage: number) =>
      divesAPI.getDives(page, perPage, {
        tripUuid: tripId,
        diveSiteUuid: diveSiteId,
        gearItemUuid: gearItemId,
        courseUuid: courseId,
        speciesUuid: speciesId,
        personUuid: personId,
      }),
    [tripId, diveSiteId, gearItemId, courseId, speciesId, personId],
  );

  // The preview asks for its few rows once and stops; a complete list pages
  // through in tens. `hasMore` is forced false for the preview so the trigger
  // below renders nothing - the header's "View all dives" button is where that
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
    enabled,
    itemsPerPage: complete ? DIVES_PER_PAGE : RECENT_DIVES_COUNT,
    errorMessage: "Failed to load dives. Please try again.",
  });

  return (
    <Card>
      <CardHeader>
        <div className={CARD_TITLE_ROW}>
          <CardTitle as="h2" className="flex items-center gap-2">
            <DiveIcon className="h-5 w-5" />
            {title}
          </CardTitle>
          {viewAllHref && (
            <Button
              variant="outline"
              size="sm"
              className={CARD_TITLE_ACTION}
              asChild
            >
              <Link href={viewAllHref}>{viewAllLabel}</Link>
            </Button>
          )}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingDives ? (
          // `RECENT_DIVES_COUNT` either way: on the dashboard it is exactly
          // the preview's size, and on a detail page the real count isn't
          // knowable up front, where a few rows is a better guess than a
          // screen of them. Busy on the list, hidden on each placeholder, as
          // the trip lists are.
          <ul className="space-y-3" aria-busy>
            {Array.from({ length: RECENT_DIVES_COUNT }, (_, index) => (
              <BackdropCardSkeleton key={index} />
            ))}
          </ul>
        ) : recentDives.length === 0 ? (
          <EmptyState
            icon={DiveIcon}
            title={emptyTitle}
            description={emptyDescription}
            action={
              <Button asChild>
                <Link href={withReturnTo(newDiveHref)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {newDiveLabel}
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {recentDives.map((dive) => (
              <DiveCard key={dive.uuid} dive={dive} />
            ))}
          </ul>
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
