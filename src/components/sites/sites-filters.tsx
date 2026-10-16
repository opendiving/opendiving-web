"use client";

import type { DiveSiteListSort } from "@/lib/api/dive-sites";
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

// Most recently dived first, where the API's own default is by name: the list
// opens on the sites a diver is most likely to be looking for.
export const NO_SITE_FILTERS: DiveSiteListFilters = {
  tagUuid: "",
  sort: "last_dived_on",
};

/** Whether the row holds anything but its opening state, the sort included. */
export function siteFiltersChanged(filters: DiveSiteListFilters): boolean {
  return Boolean(filters.tagUuid) || filters.sort !== NO_SITE_FILTERS.sort;
}

// In the select's order, the default first. A `Record` so an order the API
// grows fails to compile here rather than going unoffered.
const SORT_LABELS: Record<DiveSiteListSort, string> = {
  last_dived_on: "Most recently dived first",
  dive_count: "Most dived first",
  name: "By name",
};

export interface SitesFiltersProps {
  filters: DiveSiteListFilters;
  onFiltersChange: (filters: DiveSiteListFilters) => void;
  /** The diver's tags, or none yet - the select offers "Any tag" until they land. */
  tags?: readonly Tag[];
}

// The tag and the order, in the header card above the site cards. The API AND-s
// the tag with the header's search; the two summary orders put every site with
// no dive after every one with some.
export function SitesFilters({
  filters,
  onFiltersChange,
  tags = [],
}: SitesFiltersProps) {
  return (
    // A pair side by side from `sm` up, one per line on a phone.
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="site-tag">Tag</Label>
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
          {Object.entries(SORT_LABELS).map(([sort, label]) => (
            <option key={sort} value={sort}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
