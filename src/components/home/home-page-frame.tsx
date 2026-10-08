"use client";

import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { RecentTripsCard } from "@/components/dives/recent-trips-card";
import { DiveActivityCard } from "@/components/dives/dive-activity-card";
import { GasUseCard } from "@/components/dives/gas-use-card";
import { HomeHero } from "@/components/home/home-hero";
import { PasskeyNudgeCard } from "@/components/home/passkey-nudge-card";
import { SetupChecklistCard } from "@/components/home/setup-checklist-card";
import { useAuth } from "@/contexts/AuthContext";
import type { UserDiveStats } from "@/lib/api/dive-stats";
import type { Location } from "@/lib/api/location";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HERO_BODY, HERO_CONTROL } from "@/components/ui/map-hero";
import { cn } from "@/lib/utils";

export interface HomePageFrameProps {
  /** Null while the stats request is in flight. */
  stats?: UserDiveStats | null;
  /** Every place the diver's trips went; null while the request is in flight. */
  places?: Location[] | null;
  statsError?: string | null;
  onRetryStats?: () => void;
}

const noop = () => {};

/**
 * The signed-in home page, from the diver's name down.
 *
 * Everything on it is derived from something the diver has actually logged, and
 * the cards that can have nothing to say return `null` rather than an empty
 * tile. They are direct children of the `space-y-6` stack for exactly that
 * reason: a wrapper `<div>` around them would leave its own gap behind on the
 * days they render nothing.
 *
 * The user comes from the auth context rather than from a prop, so the name is
 * on screen at the click, before the stats request has answered.
 */
export function HomePageFrame({
  stats = null,
  places = null,
  statsError = null,
  onRetryStats = noop,
}: HomePageFrameProps) {
  const { user } = useAuth();

  if (!user) return null;

  // Kept true while the stats are still loading, so the charts hold their place
  // instead of appearing a beat after everything else. Once the answer is in and it's
  // zero, they are hidden: a chart of nothing says less to a diver with an empty
  // logbook than the checklist and the "log your first dive" prompt already do.
  //
  // A failed fetch takes the same branch as "still loading", and the error card below
  // explains why the figures are dashes.
  const hasDives = stats === null || stats.total_dives > 0;

  return (
    <div>
      <HomeHero
        title={user.name}
        stats={stats}
        places={places}
        actions={
          <Button variant="ghost" size="sm" className={HERO_CONTROL} asChild>
            <Link href="/dives/new?from=/home">
              <Plus className="h-4 w-4 mr-2" />
              Log a dive
            </Link>
          </Button>
        }
      />

      <div className={cn(HERO_BODY, "space-y-6 max-sm:space-y-2.5")}>
        {/* Gear due a service and renewals are the header's bell, on every page;
            what stays here is what only a Home visit should offer. */}
        <SetupChecklistCard totalDives={stats?.total_dives ?? null} />
        {/* Below the checklist rather than above it: a diver with an empty logbook
            has something better to do first, and this one keeps until they come
            back. It renders nothing at all once taken or dismissed. */}
        <PasskeyNudgeCard />

        {statsError && (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-(--card-pad)">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{statsError}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetryStats}
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* The two cards that say something about how the diving is *going*, rather than
            just what was logged, so they lead the rest. Gas consumption first: it's the
            one that can change how you dive tomorrow, where activity is a record of what
            already happened - and it's the harder-won number, since it needs dives that
            recorded pressures and an average depth.

            Stacked, not side by side, and that was measured rather than assumed: a
            two-column grid gives each plot 482px even on a widened page, where their
            axis text halves and the gas card's header doubles in height when its
            controls can no longer share a line with its description. See DECISIONS.md. */}
        {hasDives && <GasUseCard />}
        {hasDives && <DiveActivityCard />}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-sm:gap-2.5">
          <RecentDivesCard enabled={!!user} />
          <RecentTripsCard />
        </div>
      </div>
    </div>
  );
}
