"use client";

import {
  CURRENT_LABELS,
  DIVE_TYPE_LABELS,
  type Dive,
  ENTRY_TYPE_LABELS,
  WATER_TYPE_LABELS,
  WAVES_LABELS,
  WEATHER_LABELS,
} from "@/lib/api/dives";
import { labelOrFallback } from "@/lib/api/labels";
import { useUnits } from "@/hooks/useUnits";
import {
  formatDiveDateTime,
  formatDurationHoursMinutes,
} from "@/lib/date-time";
import {
  formatAltitude,
  formatDepth,
  formatTemperature,
  formatVisibility,
  formatWeight,
} from "@/lib/units";
import {
  RecordInfoDialog,
  type RecordInfoSection,
} from "@/components/ui/record-info-dialog";

const label = (
  labels: Readonly<Partial<Record<string, string>>>,
  value?: string | null,
) => (value ? labelOrFallback(labels, value) : null);

// The dive's own fields in the dive form's sections and order: one value per
// field. Training, People and Marine life link other records, as do the links
// inside Location and Gear, and Tanks is a list of cylinders the page's own card
// draws - so none of them is here.
export function DiveInfoDialog({ dive }: { dive: Dive }) {
  const { preferences: units } = useUnits();
  const measure = <T,>(
    value: T | null | undefined,
    format: (v: T) => string,
  ) => (value == null ? null : format(value));

  const sections: RecordInfoSection[] = [
    {
      heading: "Location",
      facts: [
        {
          label: "Entry type",
          value: label(ENTRY_TYPE_LABELS, dive.entry_type),
        },
        { label: "Boat name", value: dive.boat_name },
      ],
    },
    {
      heading: "Dive info",
      facts: [
        { label: "Dive type", value: label(DIVE_TYPE_LABELS, dive.type) },
        { label: "Start time", value: formatDiveDateTime(dive.start_time) },
        { label: "Dive number", value: dive.dive_number },
        {
          label: "Dive time",
          value: formatDurationHoursMinutes(dive.submerged_time),
        },
        {
          label: "Maximum depth",
          value: measure(dive.max_depth, (v) => formatDepth(v, units)),
        },
        {
          label: "Average depth",
          value: measure(dive.avg_depth, (v) => formatDepth(v, units)),
        },
      ],
    },
    {
      heading: "Environment",
      facts: [
        {
          label: "Bottom temperature",
          value: measure(dive.bottom_temperature, (v) =>
            formatTemperature(v, units),
          ),
        },
        {
          label: "Visibility",
          value: measure(dive.visibility, (v) => formatVisibility(v, units)),
        },
        {
          label: "Water type",
          value: label(WATER_TYPE_LABELS, dive.water_type),
        },
        {
          label: "Altitude",
          value: measure(dive.altitude, (v) => formatAltitude(v, units)),
        },
        { label: "Waves", value: label(WAVES_LABELS, dive.waves) },
        { label: "Current", value: label(CURRENT_LABELS, dive.current) },
        { label: "Weather", value: label(WEATHER_LABELS, dive.weather) },
        {
          label: "Air temperature",
          value: measure(dive.air_temperature, (v) =>
            formatTemperature(v, units),
          ),
        },
      ],
    },
    {
      heading: "Gear",
      facts: [
        {
          label: "Weight",
          value: measure(dive.weight, (v) => formatWeight(v, units)),
        },
      ],
    },
    {
      heading: "Notes",
      facts: [
        { label: "Rating", value: measure(dive.rating, (v) => `${v} / 5`) },
        { label: "Tags", value: dive.tags?.join(", ") },
        { label: "Notes", value: dive.notes, wide: true },
      ],
    },
  ];

  return <RecordInfoDialog title="Dive information" sections={sections} />;
}
