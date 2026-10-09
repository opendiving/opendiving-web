"use client";

import {
  DIVE_LIST_SORTS,
  DIVE_TYPE_LABELS,
  DIVE_TYPES,
  type DiveListSort,
  type DiveType,
} from "@/lib/api/dives";
import type { Tag } from "@/lib/api/tags";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * What narrows the dive list and orders it, as the controls hold them. `""`
 * means "not filtering on this" - the state the row opens in, and what
 * `getDives` drops rather than sending.
 */
export interface DiveListFilters {
  tagUuid: string;
  type: DiveType | "";
  sort: DiveListSort;
}

export const NO_DIVE_FILTERS: DiveListFilters = {
  tagUuid: "",
  type: "",
  sort: "date",
};

/**
 * Whether anything is narrowing the list. The sort is not: every dive is still
 * on it, in another order.
 */
export function hasDiveFilters(filters: DiveListFilters): boolean {
  return Boolean(filters.tagUuid || filters.type);
}

/** Whether the row holds anything but its opening state, the sort included. */
export function diveFiltersChanged(filters: DiveListFilters): boolean {
  return hasDiveFilters(filters) || filters.sort !== NO_DIVE_FILTERS.sort;
}

const SORT_LABELS: Record<DiveListSort, string> = {
  date: "Newest first",
  rating: "Highest rated first",
};

export interface DivesFiltersProps {
  filters: DiveListFilters;
  onFiltersChange: (filters: DiveListFilters) => void;
  /** The diver's tags, or none yet - the select offers "Any tag" until they land. */
  tags?: readonly Tag[];
}

// The tag, the type and the order, above the dive table. The two filters narrow
// one query rather than competing - the API AND-s them - and the sort orders
// whatever they leave.
export function DivesFilters({
  filters,
  onFiltersChange,
  tags = [],
}: DivesFiltersProps) {
  const set = <K extends keyof DiveListFilters>(
    key: K,
    value: DiveListFilters[K],
  ) => onFiltersChange({ ...filters, [key]: value });

  return (
    // Three across from `sm`, one per line on a phone.
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor="dive-tag">Tag</Label>
        <NativeSelect
          id="dive-tag"
          value={filters.tagUuid}
          onChange={(event) => set("tagUuid", event.target.value)}
        >
          <option value="">Any tag</option>
          {tags.map((tag) => (
            <option key={tag.uuid} value={tag.uuid}>
              {tag.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dive-type">Dive type</Label>
        <NativeSelect
          id="dive-type"
          value={filters.type}
          onChange={(event) => set("type", event.target.value as DiveType | "")}
        >
          <option value="">Any type</option>
          {DIVE_TYPES.map((type) => (
            <option key={type} value={type}>
              {DIVE_TYPE_LABELS[type]}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dive-sort">Sort</Label>
        <NativeSelect
          id="dive-sort"
          value={filters.sort}
          onChange={(event) => set("sort", event.target.value as DiveListSort)}
        >
          {DIVE_LIST_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
