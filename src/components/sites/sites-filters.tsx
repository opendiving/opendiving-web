"use client";

import {
  DIVE_SITE_LIST_SORTS,
  type DiveSiteListSort,
} from "@/lib/api/dive-sites";
import type { Tag } from "@/lib/api/tags";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * What narrows the sites list and orders it, as the controls hold them. `""`
 * means "no tag" - the state the row opens in, and what `getDiveSites` drops
 * rather than sending.
 */
export interface DiveSiteListFilters {
  tagUuid: string;
  sort: DiveSiteListSort;
}

export const NO_SITE_FILTERS: DiveSiteListFilters = {
  tagUuid: "",
  sort: "name",
};

/** Whether the row holds anything but its opening state, the sort included. */
export function siteFiltersChanged(filters: DiveSiteListFilters): boolean {
  return Boolean(filters.tagUuid) || filters.sort !== NO_SITE_FILTERS.sort;
}

const SORT_LABELS: Record<DiveSiteListSort, string> = {
  name: "By name",
  dive_count: "Most dived first",
  last_dived_on: "Most recently dived first",
};

export interface SitesFiltersProps {
  filters: DiveSiteListFilters;
  onFiltersChange: (filters: DiveSiteListFilters) => void;
  /** The diver's tags, or none yet - the select offers "Any tag" until they land. */
  tags?: readonly Tag[];
}

// The tag and the order, in the header card above the site cards: the dive
// list's row, for the sites. The two summary orders put every site with no dive
// after every one with some.
export function SitesFilters({
  filters,
  onFiltersChange,
  tags = [],
}: SitesFiltersProps) {
  return (
    // Two across from `sm`, one per line on a phone.
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="site-tag">Tag</Label>
        {/* A plain `<select>`: "Any tag" *is* `""`, and Radix reserves that
            value for clearing. */}
        <NativeSelect
          id="site-tag"
          value={filters.tagUuid}
          onChange={(event) =>
            onFiltersChange({ ...filters, tagUuid: event.target.value })
          }
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
        <Label htmlFor="site-sort">Sort</Label>
        <NativeSelect
          id="site-sort"
          value={filters.sort}
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              sort: event.target.value as DiveSiteListSort,
            })
          }
        >
          {DIVE_SITE_LIST_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
