"use client";

import { GearSet } from "@/lib/api/gear";
import { Button } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/count-badge";
import {
  CARD_TITLE_ACTION,
  CARD_TITLE_ROW,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { PlainCardList } from "@/components/ui/plain-card";
import { GearSetCard } from "@/components/gear/gear-set-card";
import { Layers, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export interface GearSetsListProps {
  sets: GearSet[];
  isLoading: boolean;
  /** True while a further page is in flight, as opposed to the first. */
  isLoadingMore: boolean;
  /** True when the last attempt failed, stopping the load-on-scroll. */
  hasFailed: boolean;
  totalCount: number;
  itemsPerPage: number;
  hasMore: boolean;
  onLoadMore: () => void;
  onCreate: () => void;
  onEdit: (set: GearSet) => void;
  onDuplicate: (set: GearSet) => void;
  deletingId: string | null;
  onDelete: (uuid: string) => void;
}

/**
 * The gear sets list: named bundles of kit a diver can load into a dive in one click,
 * a card per set inside it, as the gear list holds its items.
 *
 * No sets at all drops the header down to its hidden heading, as `ListCardHeader`
 * does for a one-list page: the empty state below already says what the card is for,
 * and carries the one button the header would.
 */
export function GearSetsList({
  sets,
  isLoading,
  isLoadingMore,
  hasFailed,
  totalCount,
  itemsPerPage,
  hasMore,
  onLoadMore,
  onCreate,
  onEdit,
  onDuplicate,
  deletingId,
  onDelete,
}: GearSetsListProps) {
  const isEmpty = !isLoading && sets.length === 0;

  return (
    <Card>
      <CardHeader className={cn(isEmpty && "p-0")}>
        {isEmpty ? (
          <CardTitle as="h2" className="sr-only">
            Gear Sets
          </CardTitle>
        ) : (
          <CardTitle as="h2" className={CARD_TITLE_ROW}>
            <span className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Gear Sets
            </span>
            <div className={`flex items-center gap-3 ${CARD_TITLE_ACTION}`}>
              <CountBadge
                count={totalCount}
                isLoading={isLoading}
                label="set"
              />
              <Button variant="outline" size="sm" onClick={onCreate}>
                <Plus className="h-4 w-4 mr-2" />
                New set
              </Button>
            </div>
          </CardTitle>
        )}
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyState
            icon={Layers}
            title="No gear sets yet"
            description="Group the kit you use together — sidemount, tech, warm water — and load it into a dive in one click."
            action={
              <Button onClick={onCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add your first set
              </Button>
            }
          />
        ) : (
          <PlainCardList placeholders={itemsPerPage}>
            {sets.map((set) => (
              <GearSetCard
                key={set.uuid}
                set={set}
                onEdit={() => onEdit(set)}
                onDuplicate={() => onDuplicate(set)}
                onDelete={() => onDelete(set.uuid)}
                isDeleting={deletingId === set.uuid}
              />
            ))}
          </PlainCardList>
        )}

        <LoadMoreTrigger
          hasMore={hasMore}
          isLoading={isLoadingMore}
          hasFailed={hasFailed}
          loadedCount={sets.length}
          totalCount={totalCount}
          itemsPerPage={itemsPerPage}
          itemLabel="gear sets"
          onLoadMore={onLoadMore}
        />
      </CardContent>
    </Card>
  );
}
