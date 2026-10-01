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
import { formatDepth, formatTemperature, formatVisibility } from "@/lib/units";

/**
 * The dive page's heading: the dive's card drawn the width of the window, with
 * its figures in whole units as the card rounds them - its duration, its
 * maximum depth, the water's temperature and the visibility, each but the
 * duration only where the dive records it, and the average depth after the
 * maximum only while those leave fewer than four.
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

  const wholeDepth = (meters: number) =>
    formatDepth(meters, units, { decimals: 0 });
  const figures: MapHeroFigure[] = [
    { label: "Duration", value: formatDurationHoursMinutes(dive.duration) },
  ];
  if (dive.max_depth != null) {
    figures.push({ label: "Max depth", value: wholeDepth(dive.max_depth) });
  }
  // `!= null` throughout, since 0 °C - or a 0 m average - is a reading.
  const readings: MapHeroFigure[] = [];
  if (dive.bottom_temperature != null) {
    readings.push({
      label: "Water temp",
      value: formatTemperature(dive.bottom_temperature, units, {
        decimals: 0,
      }),
    });
  }
  if (dive.visibility != null) {
    readings.push({
      label: "Visibility",
      value: formatVisibility(dive.visibility, units),
    });
  }
  if (dive.avg_depth != null && figures.length + readings.length < 4) {
    figures.push({ label: "Avg depth", value: wholeDepth(dive.avg_depth) });
  }
  figures.push(...readings);

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
