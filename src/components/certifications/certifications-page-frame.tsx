"use client";

import { type ReactNode } from "react";
import { BadgeCheck, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import {
  ListCardHeader,
  useIsEmptyList,
} from "@/components/ui/list-card-header";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { BackdropCardList } from "@/components/ui/backdrop-card";
import { CERTIFICATION_CARD_GRID } from "@/components/certifications/certification-card";
import { CERTIFICATION_CARD_ASPECT_CLASS } from "@/lib/certification";

export interface CertificationsPageFrameProps {
  isLoading: boolean;
  totalCount: number;
  itemsPerPage: number;
  /** One `CertificationCard` per certification - list items, for its list. */
  cards?: ReactNode[];
  isLoadingMore?: boolean;
  loadFailed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** Opens the new-card dialog. */
  onNew?: () => void;
}

const noop = () => {};

// Everything /certifications draws before its cards exist, kept apart from the data render so
// the page's first render is this frame. Every data-varying prop is optional,
// and the defaults are that first render.
export function CertificationsPageFrame({
  isLoading,
  totalCount,
  itemsPerPage,
  cards = [],
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
  onNew = noop,
}: CertificationsPageFrameProps) {
  // An unstarted wallet. Nothing narrows this list, so an empty one is the
  // whole story.
  const isEmptyList = useIsEmptyList({
    isLoading,
    count: cards.length,
    isNarrowed: false,
  });

  return (
    <div>
      <IndexHero
        title="Certifications"
        description="Keep photos of your c-cards here, so they're on hand at the dive shop without digging out the plastic"
        actions={
          <Button size="sm" onClick={onNew}>
            <Plus className="h-4 w-4 mr-2" />
            New certification
          </Button>
        }
      />

      <div className={cn(HERO_BODY, "space-y-6 max-sm:space-y-2.5")}>
        <Card>
          <ListCardHeader title="Your Certifications" isEmpty={isEmptyList}>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="certification"
            />
          </ListCardHeader>
          {/* The card is the list's header - its count - and what it says when
              there is nothing to list. The certifications themselves are cards
              of their own, so they sit below it rather than in it, as /dives
              draws its dives. */}
          {!isLoading && cards.length === 0 && (
            <CardContent>
              <EmptyState
                icon={BadgeCheck}
                title="No certifications yet"
                description="Add your c-cards so you always have them on hand at the dive shop."
                action={
                  <Button onClick={onNew}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add your first certification
                  </Button>
                }
              />
            </CardContent>
          )}
        </Card>

        {(isLoading || cards.length > 0) && (
          <BackdropCardList
            layout={CERTIFICATION_CARD_GRID}
            placeholders={itemsPerPage}
            shape={CERTIFICATION_CARD_ASPECT_CLASS}
          >
            {cards}
          </BackdropCardList>
        )}

        <LoadMoreTrigger
          hasMore={hasMore}
          isLoading={isLoadingMore}
          hasFailed={loadFailed}
          loadedCount={cards.length}
          totalCount={totalCount}
          itemsPerPage={itemsPerPage}
          itemLabel="certifications"
          onLoadMore={onLoadMore}
        />
      </div>
    </div>
  );
}
