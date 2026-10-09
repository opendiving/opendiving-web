"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Dive } from "@/lib/api/dives";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DeleteMenuItem } from "@/components/ui/item-actions-menu";
import {
  BACKDROP_CARD_LINK,
  BackdropCard,
  BackdropCardFigures,
  UnplacedBackdrop,
  type BackdropCardFigure,
} from "@/components/ui/backdrop-card";
import { MapBackdrop } from "@/components/map/map-backdrop";
import { DiveTitle } from "@/components/dives/dive-title";
import { diveFacts } from "@/components/dives/dive-facts";
import { diveChips } from "@/components/dives/dive-chips";
import { FactsLine } from "@/components/ui/icon-fact";
import { diveMapLocations } from "@/components/dives/dive-map-locations";
import { DiveIcon } from "@/components/logo";
import { DiveProfileSilhouette } from "@/components/dives/dive-profile-silhouette";
import { formatDurationHoursMinutes } from "@/lib/date-time";
import { useUnits } from "@/hooks/useUnits";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import { formatDepth, formatTemperature } from "@/lib/units";
import { Edit } from "lucide-react";

// The profile's band at the foot of the backdrop, just clear of the name: the
// `h-14` below.
const SILHOUETTE_HEIGHT = 56;
const SILHOUETTE_GAP = 4;
// The chips' row, over the band's foot: a chip at its widest breakpoint and the
// `bottom-1` it stands on. Lower than the profile's band, which covers it where
// a dive has both.
const CHIPS_HEIGHT = 26;

interface DiveCardProps {
  dive: Dive;
  // Offers Delete beside Edit. Left out where the list has no delete of its own
  // to run.
  onDelete?: () => void;
  isDeleting?: boolean;
  // The control that adds a dive the trip page shows but the trip does not hold
  // yet. A card handed one is drawn muted, with it in place of the menu.
  addToTrip?: ReactNode;
}

// One dive as a card, in every list of dives: a map of its sites and fixes as
// the backdrop - the map's water where it has none - with
// its depth curve across the foot of it, and its duration, deepest point and
// water temperature - or its average depth where it has no temperature.
export function DiveCard({
  dive,
  onDelete,
  isDeleting,
  addToTrip,
}: DiveCardProps) {
  const units = useUnits();
  // The dive's page and its edit form both return to the page the card is on.
  const withReturnTo = useWithReturnTo();
  const outline = dive.depth_outline;
  // Whole units, as the dive page's hero rounds them: the second decimal is not
  // what anyone reads a dive's depth for.
  const depth = (meters?: number) =>
    meters ? formatDepth(meters, units, { decimals: 0 }) : "-";
  const figures: BackdropCardFigure[] = [
    { label: "Duration", value: formatDurationHoursMinutes(dive.duration) },
    { label: "Max depth", value: depth(dive.max_depth) },
  ];
  // `!= null`, since 0 °C is a reading.
  if (dive.bottom_temperature != null) {
    figures.push({
      label: "Water temp",
      value: formatTemperature(dive.bottom_temperature, units, {
        decimals: 0,
      }),
    });
  }
  if (figures.length < 3 && dive.avg_depth) {
    figures.push({ label: "Avg depth", value: depth(dive.avg_depth) });
  }

  const chips = diveChips(dive);

  return (
    <BackdropCard
      actionsLabel={`Actions for dive #${dive.dive_number}`}
      corner={addToTrip}
      muted={!!addToTrip}
      actions={
        <>
          <DropdownMenuItem asChild>
            <Link href={withReturnTo(`/dives/${dive.uuid}/edit`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </DropdownMenuItem>
          {onDelete && (
            <DeleteMenuItem onSelect={onDelete} disabled={isDeleting} />
          )}
        </>
      }
      backdrop={(coveredBottom) => {
        // The map's places and the water's bubbles centre above the profile
        // and the chips rather than behind them.
        const aboveProfile = outline
          ? coveredBottom + SILHOUETTE_GAP + SILHOUETTE_HEIGHT
          : chips
            ? coveredBottom + CHIPS_HEIGHT
            : coveredBottom;
        return (
          <>
            <MapBackdrop
              locations={diveMapLocations(dive)}
              subject={`the location of dive #${dive.dive_number}`}
              coveredBottom={aboveProfile}
              water={
                <UnplacedBackdrop
                  coveredBottom={aboveProfile}
                  icon={DiveIcon}
                />
              }
            />
            {/* Without the glow the details' text has: a `drop-shadow` over
                the fill's gradient draws it in bands. */}
            {outline && (
              <div
                className="absolute inset-x-3 h-14"
                style={{ bottom: coveredBottom + SILHOUETTE_GAP }}
              >
                <DiveProfileSilhouette
                  depths={outline.values}
                  className="size-full"
                />
              </div>
            )}
          </>
        );
      }}
    >
      {chips && (
        // Over the foot of the backdrop's band rather than above the name in
        // the flow, so a dive with chips is as tall as one without. Lifted over
        // the card's link, so their hints are reachable, and only as wide as
        // they are - up to the card's width - so the link still takes a click
        // beside them. Not for a finger, whose tap on a card means the dive.
        <div className="relative z-10 h-0 touch:pointer-events-none">
          <div className="absolute bottom-1 left-0 max-w-full">{chips}</div>
        </div>
      )}
      <Link
        href={withReturnTo(`/dives/${dive.uuid}`)}
        className={BACKDROP_CARD_LINK}
      >
        <DiveTitle
          diveNumber={dive.dive_number}
          sites={dive.dive_sites}
          course={dive.course_uuid != null}
          rating={dive.rating}
        />
        {addToTrip && <span className="sr-only">{" (Not in this trip)"}</span>}
      </Link>
      <div className="text-xs">
        <FactsLine facts={diveFacts(dive)} />
      </div>
      <BackdropCardFigures figures={figures} />
    </BackdropCard>
  );
}
