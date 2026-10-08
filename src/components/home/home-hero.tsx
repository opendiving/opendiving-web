"use client";

import type { AriaAttributes, ReactNode } from "react";
import Link from "next/link";
import { Globe } from "lucide-react";
import { MapBackdrop } from "@/components/map/map-backdrop";
import { UnplacedBackdrop } from "@/components/ui/backdrop-card";
import { MapHero, type MapHeroFigure } from "@/components/ui/map-hero";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useUnits } from "@/hooks/useUnits";
import type { UserDiveStats } from "@/lib/api/dive-stats";
import type { Location } from "@/lib/api/location";
import { formatDurationHoursMinutes } from "@/lib/date-time";
import { formatDepth, type UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";

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

// The logbook's headline figures, and how many places its trips went. Null -
// in flight, or failed - shows a dash rather than a zero: "0 dives" is a
// statement about the logbook. A logbook with no dives has no dive figures,
// since a row of zeroes says less than the checklist under the hero, and a
// count of zero is left out, as a site's is: there is nothing to count yet.
function homeFigures(
  stats: UserDiveStats | null,
  places: Location[] | null,
  units: UnitSystem,
): MapHeroFigure[] {
  const figures = stats?.total_dives === 0 ? [] : diveFigures(stats, units);
  if (places?.length !== 0) {
    figures.push({ label: "Destinations", value: places?.length ?? "—" });
  }
  return figures;
}

function diveFigures(
  stats: UserDiveStats | null,
  units: UnitSystem,
): MapHeroFigure[] {
  const value = (format: (stats: UserDiveStats) => ReactNode) =>
    stats ? format(stats) : "—";
  const figures: MapHeroFigure[] = [
    { label: "Total dives", value: value((s) => s.total_dives) },
    {
      label: "Max depth",
      // Whole units and whole hours past the first: a career's totals, where
      // the remainder is noise.
      value: value((s) => formatDepth(s.max_depth, units, { decimals: 0 })),
    },
    {
      label: "Total time",
      value: value((s) =>
        s.total_time >= 3600
          ? `${Math.round(s.total_time / 3600)}h`
          : formatDurationHoursMinutes(s.total_time),
      ),
    },
  ];
  if (stats?.species_seen !== 0) {
    figures.push({
      label: "Species seen",
      // The one figure with a page behind it: the life list is this number,
      // itemised.
      value: value((s) => (
        <Link
          href="/species"
          className="rounded-sm hover:text-coral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {s.species_seen}
        </Link>
      )),
    });
  }
  return figures;
}

// The Home page's heading: the diver's name over the map of their diving, with
// the logbook's figures under it, as a record's page has its own.
export function HomeHero({
  title,
  stats,
  places,
  actions,
}: {
  title: string;
  stats: UserDiveStats | null;
  places: Location[] | null;
  actions?: ReactNode;
}) {
  const units = useUnits();
  return (
    <MapHero
      icon={DiverAvatar}
      title={title}
      actions={actions}
      figures={homeFigures(stats, places, units)}
      mapCredit
      backdrop={({ map, covered }) => (
        <MapBackdrop
          locations={places ?? []}
          // The whole world for a diver with no placed trips, as a trip's
          // page shows one with none - but only once that is known, so the
          // world is never asked for on the way to their places.
          showWhenEmpty={places !== null}
          subject="the places of your trips"
          {...map}
          water={
            <UnplacedBackdrop
              coveredBottom={covered.bottom}
              coveredTop={covered.top}
              icon={Globe}
            />
          }
        />
      )}
    />
  );
}
