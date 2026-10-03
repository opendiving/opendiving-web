"use client";

import type { ReactNode } from "react";
import { Shapes, Waves, WavesArrowDown } from "lucide-react";
import {
  DIVE_TYPE_LABELS,
  ENTRY_TYPE_LABELS,
  vocabularyLabel,
  WATER_TYPE_LABELS,
  type Dive,
} from "@/lib/api/dives";
import { MapBackdrop } from "@/components/map/map-backdrop";
import { UnplacedBackdrop } from "@/components/ui/backdrop-card";
import { MapHero, type MapHeroFigure } from "@/components/ui/map-hero";
import { FactsLine, IconFact } from "@/components/ui/icon-fact";
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
  // Its card's line - when, in the dive's own timezone, and where, since the
  // title names the site and this says where it is - then the water, the way in
  // and the kind of dive as a site's page lists its own, the water only where
  // it is not the sea's and the kind only where it is not open circuit: each
  // goes without saying.
  const facts = [
    formatDiveDateTime(dive.start_time),
    dive.dive_sites[0]?.location?.name,
    dive.water_type != null && dive.water_type !== "salt" && (
      <IconFact icon={Waves} label="Water type">
        {vocabularyLabel(WATER_TYPE_LABELS, dive.water_type)}
      </IconFact>
    ),
    dive.entry_type != null && (
      <IconFact icon={WavesArrowDown} label="Entry type">
        {vocabularyLabel(ENTRY_TYPE_LABELS, dive.entry_type)}
      </IconFact>
    ),
    dive.type != null && dive.type !== "open_circuit" && (
      <IconFact icon={Shapes} label="Dive type">
        {vocabularyLabel(DIVE_TYPE_LABELS, dive.type)}
      </IconFact>
    ),
  ].filter(Boolean);

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
