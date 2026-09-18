"use client";

import { type Ref } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  GearItemsCard,
  type GearItemsCardProps,
} from "@/components/gear/gear-items-card";
import {
  GearSetsCard,
  type GearSetsCardProps,
} from "@/components/gear/gear-sets-card";
import { DEFAULT_ITEMS_PER_PAGE } from "@/hooks/useInfiniteResource";

const noop = () => {};

// What each card is handed before anything has been asked for. The page passes
// its own bundles once it has them; without them these are its first render.
const PENDING_ITEMS: GearItemsCardProps = {
  items: [],
  isLoading: true,
  isLoadingMore: false,
  hasFailed: false,
  totalCount: 0,
  itemsPerPage: DEFAULT_ITEMS_PER_PAGE,
  hasMore: false,
  onLoadMore: noop,
  showArchived: false,
  onShowArchivedChange: noop,
  onCreate: noop,
  onEdit: noop,
  onArchiveToggle: noop,
  isArchiving: false,
  deletingId: null,
  onDelete: noop,
};

const PENDING_SETS: GearSetsCardProps = {
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
  deletingId: null,
  onDelete: noop,
};

export interface GearPageFrameProps {
  items?: GearItemsCardProps;
  sets?: GearSetsCardProps;
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gear</h1>
          <p className="text-muted-foreground mt-2">
            Track the equipment you dive with, and group it into sets you can
            load into a dive in one click
          </p>
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4 mr-2" />
          New gear
        </Button>
      </div>

      <GearItemsCard {...items} />

      <div ref={setsCardRef}>
        <GearSetsCard {...sets} />
      </div>
    </div>
  );
}
