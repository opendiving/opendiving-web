"use client";

import type { ReactNode } from "react";
import type { Dive } from "@/lib/api/dives";
import { MapBackdrop } from "@/components/map/map-backdrop";
import { UnplacedBackdrop } from "@/components/ui/backdrop-card";
import { MapHero, type MapHeroFigure } from "@/components/ui/map-hero";
import { FactsLine } from "@/components/ui/icon-fact";
import { diveFacts } from "@/components/dives/dive-facts";
import { DiveTitle } from "@/components/dives/dive-title";
import {
  diveMapLocations,
  hasMapPosition,
} from "@/components/dives/dive-map-locations";
import { DiveIcon } from "@/components/logo";
import { useUnits } from "@/hooks/useUnits";
import { formatDurationHoursMinutes } from "@/lib/date-time";
import { formatDepth, formatTemperature, formatVisibility } from "@/lib/units";
import type { ReturnTarget } from "@/lib/return-to";

/**
 * The dive page's heading: the dive's card drawn the width of the window, with
 * its figures in whole units as the card rounds them - its duration, its
 * maximum depth, the water's temperature and the visibility, each but the
 * duration only where the dive records it, and the average depth after the
 * maximum only while those leave fewer than four.
 */
export function DiveHero({
  dive,
  back,
  actions,
}: {
  dive: Dive;
  back: ReturnTarget;
  actions?: ReactNode;
}) {
  const units = useUnits();
  const locations = diveMapLocations(dive);
  const isPlaced = hasMapPosition(locations);
  const facts = diveFacts(dive);

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
      backHref={back.href}
      backLabel={back.label}
      icon={DiveIcon}
      actions={actions}
      title={
        <DiveTitle
          diveNumber={dive.dive_number}
          sites={dive.dive_sites}
          course={dive.course_uuid != null}
        />
      }
      subtitle={<FactsLine facts={facts} />}
      figures={figures}
      mapCredit={isPlaced}
      // The map's water for a dive with no position, or where this instance
      // draws no map, as its card draws one.
      backdrop={({ map, covered }) => (
        <MapBackdrop
          locations={locations}
          subject={`the location of dive #${dive.dive_number}`}
          {...map}
          water={
            <UnplacedBackdrop
              coveredBottom={covered.bottom}
              coveredTop={covered.top}
              icon={DiveIcon}
            />
          }
        />
      )}
    />
  );
}
