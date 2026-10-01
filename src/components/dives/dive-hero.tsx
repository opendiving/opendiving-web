"use client";

import type { ReactNode } from "react";
import type { Dive } from "@/lib/api/dives";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import { UnplacedBackdrop } from "@/components/ui/backdrop-card";
import { MapHero, type MapHeroFigure } from "@/components/ui/map-hero";
import { DiveTitle } from "@/components/dives/dive-title";
import {
  diveMapLocations,
  hasMapPosition,
} from "@/components/dives/dive-map-locations";
import { DiveIcon } from "@/components/logo";
import { useUnits } from "@/hooks/useUnits";
import {
  formatDiveDateTime,
  formatDurationHoursMinutes,
} from "@/lib/date-time";
import { formatDepth, formatTemperature } from "@/lib/units";

/**
 * The dive page's heading: the dive's card drawn the width of the window, with
 * its figures in the card's order - its duration, its depths and the water's
 * temperature - at the page's precision rather than the card's whole units,
 * since this is the page to read them on. Each but the duration only where the
 * dive records it, so a hand-logged dive can leave the duration on its own.
 */
export function DiveHero({
  dive,
  actions,
}: {
  dive: Dive;
  actions?: ReactNode;
}) {
  const units = useUnits();
  const locations = diveMapLocations(dive);
  const isPlaced = hasMapPosition(locations);
  // The title names the site; this says where it is.
  const placeName = dive.dive_sites[0]?.location?.name;

  const figures: MapHeroFigure[] = [
    { label: "Duration", value: formatDurationHoursMinutes(dive.duration) },
  ];
  if (dive.max_depth != null) {
    figures.push({
      label: "Max depth",
      value: formatDepth(dive.max_depth, units),
    });
  }
  // `!= null`, since 0 °C is a reading.
  if (dive.bottom_temperature != null) {
    figures.push({
      label: "Water temp",
      value: formatTemperature(dive.bottom_temperature, units),
    });
  }
  if (dive.avg_depth != null) {
    figures.push({
      label: "Avg depth",
      value: formatDepth(dive.avg_depth, units),
    });
  }

  return (
    <MapHero
      backHref="/dives"
      backLabel="Back to dives"
      icon={DiveIcon}
      actions={actions}
      title={
        <DiveTitle diveNumber={dive.dive_number} sites={dive.dive_sites} />
      }
      // Its card's line: when, in the dive's own timezone, and where.
      subtitle={
        <>
          {formatDiveDateTime(dive.start_time)}
          {placeName && ` · ${placeName}`}
        </>
      }
      figures={figures}
      mapCredit={isPlaced}
      // The map's water for a dive with no position, as its card draws one.
      backdrop={(covered) =>
        isPlaced ? (
          <LocationsMap
            locations={locations}
            subject={`the location of dive #${dive.dive_number}`}
            className="h-full rounded-none border-0 sm:h-full"
            backdrop
            coveredBottom={covered.bottom}
            coveredTop={covered.top}
            creditElsewhere
            snapshot
            sideFade
          />
        ) : (
          <UnplacedBackdrop
            coveredBottom={covered.bottom}
            coveredTop={covered.top}
            icon={DiveIcon}
          />
        )
      }
    />
  );
}
