"use client";

import { type RefObject } from "react";

import {
  DIVE_SITE_LIST_SORTS,
  type DiveSiteListSort,
} from "@/lib/api/dive-sites";
import type { Tag } from "@/lib/api/tags";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SearchInput } from "@/components/ui/search-input";

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
  /** What the search box holds, which is not yet what has been asked for. */
  search: string;
  onSearchChange: (value: string) => void;
  filters: DiveSiteListFilters;
  onFiltersChange: (filters: DiveSiteListFilters) => void;
  /** The diver's tags, or none yet - the select offers "Any tag" until they land. */
  tags?: readonly Tag[];
  /** The search box itself, for a caller that puts the cursor in it. */
  searchRef?: RefObject<HTMLInputElement | null>;
}

// The search, the tag and the order, in the header card above the site cards:
// the course list's row, for the sites. The API AND-s the search and the tag;
// the two summary orders put every site with no dive after every one with some.
export function SitesFilters({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  tags = [],
  searchRef,
}: SitesFiltersProps) {
  return (
    // A row of three on a desktop, the search taking a double track since a
    // place name is longer than a tag; the search on its own line above the
    // pair below that, and one per line on a phone.
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
      <SearchInput
        id="dive-site-search"
        label="Search dive sites by name or location"
        placeholder="Search by name or location..."
        value={search}
        onChange={onSearchChange}
        inputRef={searchRef}
        className="sm:col-span-2 lg:col-span-1"
      />

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
