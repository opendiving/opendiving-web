"use client";

import { useCallback, useId, useRef } from "react";

import type { AcceptIntoTarget } from "@/components/admin/proposal-decisions";
import {
  commonsCredits,
  CommonsCredit,
  diveSiteSearchResult,
} from "@/components/sites/commons-site";
import { Button } from "@/components/ui/button";
import {
  CreatableCombobox,
  type ComboboxSearchResult,
} from "@/components/ui/creatable-combobox";
import { Label } from "@/components/ui/label";
import { useUnits } from "@/hooks/useUnits";
import type { AdminDiveSiteProposal } from "@/lib/api/admin";
import {
  diveSitesAPI,
  isCommonsSite,
  MAX_SITE_QUERY_LENGTH,
  MIN_SITE_QUERY_LENGTH,
  type CommonsMatchRule,
} from "@/lib/api/dive-sites";
import { formatDistance } from "@/lib/geo-distance";

const RULE_LABELS: Record<CommonsMatchRule, string> = {
  identity: "Shares a registry entry",
  within_20_m: "Within 20 m, whatever the name",
  similar_name_within_200_m: "A similar name within 200 m",
  same_name_within_5_km: "The same name within 5 km",
};

const SITES_PER_SEARCH = 25;

interface ProposalMatchesProps {
  proposal: AdminDiveSiteProposal;
  onAcceptInto: (target: AcceptIntoTarget) => void;
}

// The records the proposed site may be, each with the rule it met, and for a new
// site the way to fold it into one of them or into a record found by name.
export function ProposalMatches({
  proposal,
  onAcceptInto,
}: ProposalMatchesProps) {
  const units = useUnits();
  const canFold = proposal.kind === "new_site";
  const credits = commonsCredits(proposal.matches);

  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Matches</h3>
      {proposal.matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Commons site looks like this one.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {proposal.matches.map((match) => (
            <li
              key={match.uuid}
              className="flex items-start justify-between gap-3 p-3"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium break-words">{match.name}</p>
                {match.location_name && (
                  <p className="text-muted-foreground">{match.location_name}</p>
                )}
                <p className="text-muted-foreground">
                  {RULE_LABELS[match.rule]}
                  {match.distance_metres !== null &&
                    ` · ${formatDistance(match.distance_metres, units)} away`}
                </p>
                {match.qualifier_siblings && (
                  <p className="text-muted-foreground">
                    The names differ only by a word like West or East, which
                    usually means two sites.
                  </p>
                )}
              </div>
              {canFold && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => onAcceptInto(match)}
                >
                  Accept into
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {credits.map((credit) => (
        <CommonsCredit key={credit} attribution={credit} />
      ))}
      {canFold && <RecordSearch onPick={onAcceptInto} />}
    </section>
  );
}

// The lookup without `commons_only`, which leaves out what the reviewer has saved
// and so would hide the record most likely to be looked for here.
function RecordSearch({
  onPick,
}: {
  onPick: (target: AcceptIntoTarget) => void;
}) {
  const fieldId = useId();
  const seen = useRef(new Map<string, AcceptIntoTarget>());

  const search = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      const text = query.trim();
      if (
        text.length < MIN_SITE_QUERY_LENGTH ||
        text.length > MAX_SITE_QUERY_LENGTH
      ) {
        return { items: [] };
      }
      const page = await diveSitesAPI.lookupDiveSites(1, SITES_PER_SEARCH, {
        search: text,
      });
      const records = page.data.filter(isCommonsSite);
      records.forEach(({ uuid, name, attribution }) =>
        seen.current.set(uuid, { uuid, name, attribution }),
      );
      return diveSiteSearchResult({ ...page, data: records });
    },
    [],
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>Accept into another Commons site</Label>
      <CreatableCombobox
        id={fieldId}
        onSearch={search}
        minSearchLength={MIN_SITE_QUERY_LENGTH}
        maxSearchLength={MAX_SITE_QUERY_LENGTH}
        // A pick opens a dialog, so a name that spells a row on the way to a longer
        // one must not be a pick.
        commitOnEnterOnly
        onChange={(uuid) => {
          const target = uuid ? seen.current.get(uuid) : undefined;
          if (target) onPick(target);
        }}
        placeholder="Search the Commons by name"
        noItemsLabel="Type to search the Commons."
        noMatchesLabel="No Commons site by that name."
      />
    </div>
  );
}
