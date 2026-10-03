"use client";

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
import { CardMapPicture } from "@/components/map/card-map-picture";
import { mapLabel } from "@/components/map/map-label";
import { DiveTitle } from "@/components/dives/dive-title";
import { diveMapLocations } from "@/components/dives/dive-map-locations";
import { placedLocations } from "@/lib/map-picture";
import { DiveIcon } from "@/components/logo";
import { DiveProfileSilhouette } from "@/components/dives/dive-profile-silhouette";
import {
  formatDiveDateTime,
  formatDurationHoursMinutes,
} from "@/lib/date-time";
import { useUnits } from "@/hooks/useUnits";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import { formatDepth, formatTemperature } from "@/lib/units";
import { Edit } from "lucide-react";

// The profile's band at the foot of the backdrop, just clear of the name: the
// `h-14` below.
const SILHOUETTE_HEIGHT = 56;
const SILHOUETTE_GAP = 4;

interface DiveCardProps {
  dive: Dive;
  // Offers Delete beside Edit. Left out where the list has no delete of its own
  // to run.
  onDelete?: () => void;
  isDeleting?: boolean;
}

// One dive as a card, in every list of dives: the server's picture of its
// sites and fixes as the backdrop - the map's water where there is none - with
// its depth curve across the foot of it, and its duration, deepest point and
// water temperature - or its average depth where it has no temperature.
export function DiveCard({ dive, onDelete, isDeleting }: DiveCardProps) {
  const units = useUnits();
  // The dive's page and its edit form both return to the page the card is on.
  const withReturnTo = useWithReturnTo();
  const outline = dive.depth_outline;
  // The title names the site; this says where it is.
  const placeName = dive.dive_sites[0]?.location?.name;
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

  return (
    <BackdropCard
      actionsLabel={`Actions for dive #${dive.dive_number}`}
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
        // rather than behind it.
        const aboveProfile = outline
          ? coveredBottom + SILHOUETTE_GAP + SILHOUETTE_HEIGHT
          : coveredBottom;
        return (
          <>
            <CardMapPicture
              kind="dive"
              uuid={dive.uuid}
              digest={dive.map_picture}
              label={mapLabel(
                placedLocations(diveMapLocations(dive)),
                `the location of dive #${dive.dive_number}`,
              )}
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
      <Link
        href={withReturnTo(`/dives/${dive.uuid}`)}
        className={BACKDROP_CARD_LINK}
      >
        <DiveTitle diveNumber={dive.dive_number} sites={dive.dive_sites} />
      </Link>
      <div className="text-xs">
        {formatDiveDateTime(dive.start_time)}
        {placeName && ` · ${placeName}`}
      </div>
      <BackdropCardFigures figures={figures} />
    </BackdropCard>
  );
}
