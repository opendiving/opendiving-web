"use client";

import { type AriaAttributes, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownToLine,
  Clock,
  Fish,
  Plus,
} from "lucide-react";
import { DiveIcon } from "@/components/logo";
import { RecentDivesCard } from "@/components/dives/recent-dives-card";
import { RecentTripsCard } from "@/components/dives/recent-trips-card";
import { DiveActivityCard } from "@/components/dives/dive-activity-card";
import { GasUseCard } from "@/components/dives/gas-use-card";
import { PasskeyNudgeCard } from "@/components/dashboard/passkey-nudge-card";
import { SetupChecklistCard } from "@/components/dashboard/setup-checklist-card";
import { useAuth } from "@/contexts/AuthContext";
import type { UserDiveStats } from "@/lib/api/dive-stats";
import { formatDurationHoursMinutes } from "@/lib/date-time";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import { useUnits } from "@/hooks/useUnits";
import { formatDepth } from "@/lib/units";

// One headline number, as a cell inside the stats card rather than a card of its
// own - see the card's own comment for why the four were merged.
//
// `value` is `null` only while the stats request is in flight, and renders as a
// dash rather than a zero: "0 dives" is a statement about the logbook, and
// showing it before the answer is known reads as one.
//
// `href` makes the cell a link where the number has a page behind it. It is a
// `<Link>` wrapping the same markup rather than a card with an action in it -
// this component was renamed from `StatCard` to `Stat` precisely because it
// renders a cell, and the grid it sits in is what gives it its shape. Anything
// that turned it back into a card would break the four-across row.
function Stat({
  title,
  icon,
  value,
  hint,
  href,
}: {
  title: string;
  icon: ReactNode;
  value: string | null;
  hint: string;
  href?: string;
}) {
  const body = (
    <>
      {/* The icon leads the label rather than sitting opposite it, as it did
          when each of these was a card wide enough to push the two apart. In a
          quarter-width column there is nothing to push against, and a right-
          aligned icon just floats away from the words it belongs to. */}
      {/* `group-hover:` is inert without a `group` ancestor, so the same markup
          serves both branches: the linked cell picks up the hover colour, the
          plain one is unaffected. */}
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1 group-hover:text-coral">
        {icon}
        {title}
      </div>
      <div className="text-2xl font-bold">{value ?? "—"}</div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </>
  );

  // `block` so the anchor fills its grid cell the way the plain `<div>` does -
  // an inline anchor would shrink to its text and leave the number unclickable
  // wherever the words are shorter than the column.
  return href ? (
    <Link
      href={href}
      className="group block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

// The diver's picture where a record's page has its kind's icon, at its sizes
// and as decorative, the initials scaled to match.
function DiverAvatar({
  className,
  "aria-hidden": ariaHidden,
}: {
  className?: string;
  "aria-hidden"?: AriaAttributes["aria-hidden"];
}) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <UserAvatar
      name={user.name}
      avatarSha={user.avatar_sha256}
      className={cn(className, "text-sm md:text-[22px]")}
      aria-hidden={ariaHidden}
    />
  );
}

export interface DashboardPageFrameProps {
  /** Null while the stats request is in flight. */
  stats?: UserDiveStats | null;
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
export function DashboardPageFrame({
  stats = null,
  statsError = null,
  onRetryStats = noop,
}: DashboardPageFrameProps) {
  const { user } = useAuth();
  const units = useUnits();

  if (!user) return null;

  // Kept true while the stats are still loading, so the tiles and the chart hold their
  // place instead of appearing a beat after everything else. Once the answer is in and
  // it's zero, both are hidden: a row of zeroes and a chart of nothing say less to a
  // diver with an empty logbook than the checklist and the "log your first dive"
  // prompt directly below them already do.
  //
  // A failed fetch takes the same branch as "still loading" so the tiles keep their
  // place, and the error card below explains why they are empty.
  const hasDives = stats === null || stats.total_dives > 0;

  return (
    <div>
      <IndexHero
        icon={DiverAvatar}
        title={user.name}
        subtitle="Your logbook, your trips and your stats, at a glance"
        actions={
          <Button asChild size="sm">
            <Link href="/dives/new?from=/dashboard">
              <Plus className="h-4 w-4 mr-2" />
              Log a dive
            </Link>
          </Button>
        }
      />

      <div className={cn(HERO_BODY, "space-y-6")}>
        {/* Gear due a service and renewals are the header's bell, on every page;
            what stays here is what only a dashboard visit should offer. */}
        <SetupChecklistCard totalDives={stats?.total_dives ?? null} />
        {/* Below the checklist rather than above it: a diver with an empty logbook
            has something better to do first, and this one keeps until they come
            back. It renders nothing at all once taken or dismissed. */}
        <PasskeyNudgeCard />

        {statsError && (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
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

        {hasDives && (
          /* The four headline numbers in one card - they are read together as
             "what my logbook amounts to", and four separate cards spent four headers and
             four borders saying so four times. Four boxes in a row also read as
             four unrelated things; one box reads as one summary, which is what it
             is.

             No header: each figure is already labelled, so a "Your diving" title
             above them would only restate the four labels underneath. `pt-6` because `CardContent`'s own padding
             assumes a header sits above it. */
          <Card>
            <CardContent className="pt-6">
              {/* One row wherever there is room for four, and a 2×2 below that
                  rather than a single column: these are four short figures, and
                  stacking them would run the card down the page for no gain.

                  Measured, at `lg`: 248px columns at 1280 and 216px at 1024, both
                  one line per value. Below the breakpoint the 2×2 gives 393px at
                  900 and 139px at 375, still one line. Only at 320 - the narrowest
                  phone still worth supporting - does the longest value
                  ("450h 39min") wrap to two, which costs a taller row and nothing
                  else: no value overflows its column and the page never scrolls
                  sideways at any of those widths. */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-6">
                <Stat
                  title="Total dives"
                  icon={<DiveIcon className="h-4 w-4" />}
                  value={stats && String(stats.total_dives)}
                  hint="Logged in your logbook"
                />
                <Stat
                  title="Max depth"
                  icon={<ArrowDownToLine className="h-4 w-4" />}
                  value={stats && formatDepth(stats.max_depth, units)}
                  hint="Personal best"
                />
                <Stat
                  title="Total time"
                  icon={<Clock className="h-4 w-4" />}
                  value={stats && formatDurationHoursMinutes(stats.total_time)}
                  hint="Underwater"
                />
                {/* The one tile with a page behind it: the life list is exactly
                    this number, itemised. The other three summarise the whole
                    logbook and have nowhere more specific to go. */}
                <Stat
                  title="Species seen"
                  icon={<Fish className="h-4 w-4" />}
                  value={stats && String(stats.species_seen)}
                  hint="Distinct species spotted"
                  href="/species"
                />
              </div>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecentDivesCard enabled={!!user} />
          <RecentTripsCard />
        </div>
      </div>
    </div>
  );
}
