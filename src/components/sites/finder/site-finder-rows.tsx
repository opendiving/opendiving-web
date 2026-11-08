"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";

import {
  isCommonsSite,
  type DiveSiteSearchItem,
  type PlaceSearchItem,
} from "@/lib/api/dive-sites";
import type { LatLon } from "@/lib/basemap";
import { formatDistance } from "@/lib/geo-distance";
import { formatDepth } from "@/lib/units";
import { useUnits } from "@/hooks/useUnits";
import { Attribution } from "@/components/attribution";
import { CommonsBadge, CommonsCredit } from "@/components/sites/commons-site";
import { diveSiteFacts } from "@/components/sites/dive-site-facts";
import { WAITING_FOR_REVIEW } from "@/components/sites/site-commons-notices";
import { Badge } from "@/components/ui/badge";
import { FactsLine } from "@/components/ui/icon-fact";
import { cn } from "@/lib/utils";

const ROW =
  "relative rounded-md border bg-card p-3 text-sm transition-colors hover:bg-muted/50";

// A row's name: the site's page where the host links to it, else a button the
// host's pick answers - the dive form's, which adds the site to the dive.
function RowName({
  name,
  href,
  onPick,
}: {
  name: string;
  href?: string;
  onPick?: () => void;
}) {
  const className =
    "font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline outline-none after:absolute after:inset-0 after:content-['']";
  if (href) {
    return (
      <Link href={href} className={className}>
        {name}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(className, "text-left")}
    >
      {name}
    </button>
  );
}

export interface SiteRowProps {
  site: DiveSiteSearchItem;
  href?: string;
  onPick?: () => void;
  /** The cards' menu, where the host offers it. */
  menu?: ReactNode;
  /** Fired with the pin while the row is pointed at or focused, and null after. */
  onPoint?: (pin: LatLon | null) => void;
  /** The row the map's touched point names. */
  isCurrent?: boolean;
}

// One site in the finder's list: its name, where it is and how far from the
// camera, what the diver's dives there add up to, and, for a Commons record,
// the badge and the credit its source asks for.
export function SiteRow({
  site,
  href,
  onPick,
  menu,
  onPoint,
  isCurrent,
}: SiteRowProps) {
  const units = useUnits();
  const facts = diveSiteFacts(site, units);
  const pin =
    site.latitude != null && site.longitude != null
      ? { latitude: site.latitude, longitude: site.longitude }
      : null;
  const point = () => onPoint?.(pin);
  const leave = () => onPoint?.(null);
  const dives = site.dives;
  const figures = dives
    ? [
        `${dives.dive_count} ${dives.dive_count === 1 ? "dive" : "dives"}`,
        dives.max_dive_depth != null &&
          `deepest ${formatDepth(dives.max_dive_depth, units, { decimals: 0 })}`,
        dives.species_count > 0 && `${dives.species_count} species seen`,
      ].filter(Boolean)
    : [];

  return (
    <li
      className={cn(ROW, isCurrent && "ring-2 ring-coral")}
      aria-current={isCurrent || undefined}
      onPointerEnter={point}
      onPointerLeave={leave}
      onFocus={point}
      onBlur={leave}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <RowName name={site.name} href={href} onPick={onPick} />
            {site.distance_m != null && (
              <span className="text-xs text-muted-foreground">
                {formatDistance(site.distance_m, units)} away
              </span>
            )}
          </div>
          {facts.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <FactsLine facts={facts} />
            </div>
          )}
          {figures.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {figures.join(" · ")}
            </p>
          )}
          {site.proposal?.status === "waiting" && (
            <Badge variant="outline" className="font-medium">
              {WAITING_FOR_REVIEW}
            </Badge>
          )}
          {/* Lifted over the stretched name, which would swallow the credit's own link. */}
          {isCommonsSite(site) && (
            <div className="relative z-10 flex flex-wrap items-center gap-2">
              <CommonsBadge />
              <CommonsCredit attribution={site.attribution} />
            </div>
          )}
        </div>
        {menu && <div className="relative z-10 shrink-0">{menu}</div>}
      </div>
    </li>
  );
}

export interface PlaceRowProps {
  place: PlaceSearchItem;
  onPick: () => void;
}

// A place the geocoder knows by the name typed: picking it moves the map there.
// "No sites nearby" is said rather than hidden, since that is where a diver would
// add one.
export function PlaceRow({ place, onPick }: PlaceRowProps) {
  const units = useUnits();
  const title = place.name || place.location;
  const nearby =
    place.sites_nearby === 0
      ? "No sites nearby"
      : `${place.sites_nearby} ${place.sites_nearby === 1 ? "site" : "sites"} nearby`;
  return (
    <li className={ROW}>
      <div className="flex items-start gap-2">
        <MapPin
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <button
              type="button"
              onClick={onPick}
              className="text-left font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:underline after:absolute after:inset-0 after:content-['']"
            >
              {title}
            </button>
            {place.distance_m != null && (
              <span className="text-xs text-muted-foreground">
                {formatDistance(place.distance_m, units)} away
              </span>
            )}
          </div>
          {title !== place.location && (
            <p className="text-xs text-muted-foreground">{place.location}</p>
          )}
          <p className="text-xs text-muted-foreground">{nearby}</p>
          <p className="relative z-10 text-[10px] leading-4 text-muted-foreground">
            <Attribution value={place.attribution} />
          </p>
        </div>
      </div>
    </li>
  );
}
