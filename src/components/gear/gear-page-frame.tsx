"use client";

import { type Ref } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";
import { cn } from "@/lib/utils";
import {
  GearItemsList,
  type GearItemsListProps,
} from "@/components/gear/gear-items-list";
import {
  GearSetsList,
  type GearSetsListProps,
} from "@/components/gear/gear-sets-list";
import { DEFAULT_ITEMS_PER_PAGE } from "@/hooks/useInfiniteResource";

const noop = () => {};

// What each list is handed before anything has been asked for. The page passes
// its own bundles once it has them; without them these are its first render.
const PENDING_ITEMS: GearItemsListProps = {
  items: [],
  isLoading: true,
  isLoadingMore: false,
  hasFailed: false,
  totalCount: 0,
  itemsPerPage: DEFAULT_ITEMS_PER_PAGE,
  hasMore: false,
  onLoadMore: noop,
  showArchived: false,
  hasArchived: false,
  onShowArchivedChange: noop,
  onCreate: noop,
  onEdit: noop,
  onArchiveToggle: noop,
  isArchiving: false,
  deletingId: null,
  onDelete: noop,
};

const PENDING_SETS: GearSetsListProps = {
  sets: [],
  isLoading: true,
  isLoadingMore: false,
  hasFailed: false,
  totalCount: 0,
  itemsPerPage: DEFAULT_ITEMS_PER_PAGE,
  hasMore: false,
  onLoadMore: noop,
  onCreate: noop,
  onEdit: noop,
  onDuplicate: noop,
  deletingId: null,
  onDelete: noop,
};

export interface GearPageFrameProps {
  items?: GearItemsListProps;
  sets?: GearSetsListProps;
  /** Opens the new-gear dialog. */
  onNew?: () => void;
  /** The page watches this box to decide when to ask for the sets. */
  setsCardRef?: Ref<HTMLDivElement>;
}

// Everything /gear draws before either list exists, kept apart from the data render so
// the page's first render is this frame. Every data-varying prop is optional,
// and the defaults are that first render.
export function GearPageFrame({
  items = PENDING_ITEMS,
  sets = PENDING_SETS,
  onNew = noop,
  setsCardRef,
}: GearPageFrameProps) {
  return (
    <div>
      <IndexHero
        title="Gear"
        description="Track the equipment you dive with, and group it into sets you can load into a dive in one click"
        actions={
          <Button size="sm" onClick={onNew}>
            <Plus className="h-4 w-4 mr-2" />
            New gear
          </Button>
        }
      />

      <div className={cn(HERO_BODY, "space-y-6 max-sm:space-y-2.5")}>
        <GearItemsList {...items} />

        <div ref={setsCardRef}>
          <GearSetsList {...sets} />
        </div>
      </div>
    </div>
  );
}
