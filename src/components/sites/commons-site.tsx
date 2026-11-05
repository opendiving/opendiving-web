"use client";

import { Attribution } from "@/components/attribution";
import { Badge } from "@/components/ui/badge";
import type {
  ComboboxItem,
  ComboboxSearchResult,
} from "@/components/ui/creatable-combobox";
import {
  isCommonsSite,
  type CommonsMatchRule,
  type DiveSiteLookupItem,
} from "@/lib/api/dive-sites";
import { cn } from "@/lib/utils";

/** What marks a site every account shares, on a menu row as on a badge. */
export const COMMONS_LABEL = "Commons";

/** Why a Commons record may be the same place as a site. */
export const COMMONS_MATCH_RULE_LABELS: Record<CommonsMatchRule, string> = {
  identity: "Shares a registry entry",
  within_20_m: "Within 20 m, whatever the name",
  similar_name_within_200_m: "A similar name within 200 m",
  same_name_within_5_km: "The same name within 5 km",
};

export function CommonsBadge() {
  return (
    <Badge variant="outline" className="font-medium">
      {COMMONS_LABEL}
    </Badge>
  );
}

// The credit a Commons record's source asks for, as fine print. Draws nothing
// where the API sent none, which is every site of the diver's own.
export function CommonsCredit({
  attribution,
  className,
}: {
  attribution: string | null | undefined;
  className?: string;
}) {
  if (!attribution) return null;
  return (
    <p className={cn("text-[10px] leading-4 text-muted-foreground", className)}>
      <Attribution value={attribution} />
    </p>
  );
}

/** A lookup row as a menu row: the mark says which of the rows are Commons records. */
export function commonsMark(
  site: DiveSiteLookupItem,
): Pick<ComboboxItem, "badge"> {
  return isCommonsSite(site) ? { badge: COMMONS_LABEL } : {};
}

/** The credits of a list of records, each once, in the order they came. */
export function commonsCredits(
  sites: Pick<DiveSiteLookupItem, "attribution">[],
): string[] {
  const credits = sites.flatMap((site) => site.attribution ?? []);
  return [...new Set(credits)];
}

/**
 * A page of the lookup as a picker's menu, in the order the API sent: the diver's
 * sites, then the Commons records they have not saved.
 */
export function diveSiteSearchResult(page: {
  data: DiveSiteLookupItem[];
  has_more: boolean;
}): ComboboxSearchResult {
  return {
    items: page.data.map((site) => ({
      id: site.uuid,
      name: site.name,
      hint: site.location?.name,
      ...commonsMark(site),
    })),
    hasMore: page.has_more,
    credits: commonsCredits(page.data),
  };
}
