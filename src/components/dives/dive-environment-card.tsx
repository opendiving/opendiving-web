"use client";

import type { ReactNode } from "react";
import {
  CURRENT_LABELS,
  type Dive,
  WATER_TYPE_LABELS,
  WAVES_LABELS,
  WEATHER_LABELS,
} from "@/lib/api/dives";
import { labelOrFallback } from "@/lib/api/labels";
import { CARD_SECTION_CONTENT, Card, CardContent } from "@/components/ui/card";
import { Attribution } from "@/components/attribution";
import { CardFigure, CardFigures } from "@/components/dives/card-figure";
import { DiveCardHeader } from "@/components/dives/dive-card-header";
import { FetchedMark } from "@/components/dives/autofilled-marks";
import { TideDiagram } from "@/components/dives/tide-diagram";
import { useUnits } from "@/hooks/useUnits";
import { formatClockAtOffset } from "@/lib/date-time";
import {
  TIDE_STATE_LABELS,
  compassPoint,
  fetchedFields,
} from "@/lib/dive-conditions";
import {
  formatAltitude,
  formatDepth,
  formatTemperature,
  formatWindSpeed,
} from "@/lib/units";

interface DiveEnvironmentCardProps {
  dive: Dive;
  onEdit?: () => void;
}

interface Figure {
  key: string;
  label: ReactNode;
  value: ReactNode;
}

/**
 * What the water and the air were like: the diver's own figures, and beside them
 * whatever a weather service answered for the dive's place and hour.
 *
 * A field the service filled carries its mark until the diver replaces the value,
 * and the service's credit sits under the figures whenever anything of its is
 * shown. Renders nothing when there is nothing to show.
 */
export function DiveEnvironmentCard({
  dive,
  onEdit,
}: DiveEnvironmentCardProps) {
  const units = useUnits();
  const conditions = dive.conditions ?? null;
  const fetched = fetchedFields(dive);
  const labelled = (label: string, field: keyof typeof fetched) =>
    field in fetched ? (
      <>
        {label}
        <FetchedMark />
      </>
    ) : (
      label
    );

  const figures: Figure[] = [];
  if (dive.air_temperature != null) {
    figures.push({
      key: "air_temperature",
      label: labelled("Air temperature", "air_temperature"),
      value: formatTemperature(dive.air_temperature, units),
    });
  }
  if (dive.water_type != null) {
    figures.push({
      key: "water_type",
      label: "Water type",
      value: labelOrFallback(WATER_TYPE_LABELS, dive.water_type),
    });
  }
  if (dive.altitude != null) {
    figures.push({
      key: "altitude",
      label: "Altitude",
      value: formatAltitude(dive.altitude, units),
    });
  }
  if (dive.current != null) {
    figures.push({
      key: "current",
      label: "Current",
      value: labelOrFallback(CURRENT_LABELS, dive.current),
    });
  }
  if (dive.waves != null) {
    figures.push({
      key: "waves",
      label: labelled("Waves", "waves"),
      value: labelOrFallback(WAVES_LABELS, dive.waves),
    });
  }
  if (dive.weather != null) {
    figures.push({
      key: "weather",
      label: labelled("Weather", "weather"),
      value: labelOrFallback(WEATHER_LABELS, dive.weather),
    });
  }

  // The service's figures the dive has no field for.
  const weather = conditions?.weather;
  const sea = conditions?.sea;
  const fetchedOnly: Figure[] = [];
  if (weather?.wind_speed != null) {
    fetchedOnly.push({
      key: "wind",
      label:
        weather.wind_direction != null
          ? `Wind from ${compassPoint(weather.wind_direction)}`
          : "Wind",
      value: formatWindSpeed(weather.wind_speed, units),
    });
  }
  if (sea?.sea_surface_temperature != null) {
    fetchedOnly.push({
      key: "sea_temperature",
      label: "Sea temperature",
      value: formatTemperature(sea.sea_surface_temperature, units),
    });
  }
  if (sea?.wave_height != null) {
    fetchedOnly.push({
      key: "wave_height",
      label: "Wave height",
      value: formatDepth(sea.wave_height, units, { decimals: 1 }),
    });
  }
  // Drawn where the dive has a turn on both sides of it, and otherwise as the
  // figures there are, since one turn gives a curve nothing to span.
  const tide =
    conditions && sea?.previous_extreme && sea.next_extreme
      ? { previous: sea.previous_extreme, next: sea.next_extreme }
      : null;
  if (!tide && conditions && sea?.tide_state != null) {
    fetchedOnly.push({
      key: "tide",
      label: "Tide",
      value: TIDE_STATE_LABELS[sea.tide_state] ?? sea.tide_state,
    });
  }
  // At the record's own offset, which is the dive's where the dive has one and
  // the place's on that date where it does not - either way the clock the dive's
  // start time is read on.
  if (!tide && conditions) {
    for (const [extreme, when] of [
      [sea?.previous_extreme, "Last"],
      [sea?.next_extreme, "Next"],
    ] as const) {
      if (!extreme) continue;
      fetchedOnly.push({
        key: `${when}_extreme`,
        label: `${when} ${extreme.kind}`,
        value: formatClockAtOffset(extreme.at, conditions.utc_offset_minutes),
      });
    }
  }

  const showsFetched =
    conditions != null &&
    (fetchedOnly.length > 0 || tide != null || Object.keys(fetched).length > 0);
  const all = [...figures, ...fetchedOnly];
  if (all.length === 0 && !tide) return null;

  return (
    <Card>
      <DiveCardHeader group="Environment" title="Environment" onEdit={onEdit} />
      <CardContent className={CARD_SECTION_CONTENT}>
        {all.length > 0 && (
          <CardFigures className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]">
            {all.map(({ key, label, value }) => (
              <CardFigure key={key} label={label} value={value} />
            ))}
          </CardFigures>
        )}
        {conditions && tide && (
          <TideDiagram
            className={all.length > 0 ? "mt-3" : undefined}
            previous={tide.previous}
            next={tide.next}
            start={conditions.at}
            duration={dive.submerged_time}
            state={sea?.tide_state ?? null}
            utcOffsetMinutes={conditions.utc_offset_minutes}
          />
        )}
        {showsFetched && (
          <p className="mt-3 text-xs text-muted-foreground">
            <Attribution value={conditions.attribution} />
          </p>
        )}
      </CardContent>
    </Card>
  );
}
