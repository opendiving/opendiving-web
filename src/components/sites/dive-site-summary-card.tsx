"use client";

import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import type { DiveSite } from "@/lib/api/dive-sites";
import { useUnits } from "@/hooks/useUnits";
import { formatDateOnly } from "@/lib/date-time";
import { formatDepth } from "@/lib/units";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// One figure: a small label over the number, the shape of the stat row above the
// dashboard's charts.
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * What the diver's own dives say of the site, as the API counts them: every live
 * dive naming it at any position. Derived, never typed, so it is the place for a
 * deepest dive and an average rating rather than a member a diver would have to
 * keep up to date.
 *
 * Nothing at all for a site with no dives: the dives card beside it already says
 * so, and a row of zeros and dashes would only repeat it.
 */
export function DiveSiteSummaryCard({ site }: { site: DiveSite }) {
  const units = useUnits();
  if (!site.dive_count) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <Stat label="Dives">{site.dive_count}</Stat>
          {site.last_dived_on && (
            <Stat label="Last dive">{formatDateOnly(site.last_dived_on)}</Stat>
          )}
          {site.max_dive_depth != null && (
            <Stat label="Deepest">
              {formatDepth(site.max_dive_depth, units)}
            </Stat>
          )}
          {/* Distinct species over these dives - the list beside this card. */}
          <Stat label="Species">{site.species_count ?? 0}</Stat>
          {site.average_rating != null && (
            <Stat label="Average rating">
              {site.average_rating.toFixed(1)}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}
                of 5
              </span>
            </Stat>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
