import {
  CURRENT_LABELS,
  DIVE_TYPE_LABELS,
  ENTRY_TYPE_LABELS,
  WATER_TYPE_LABELS,
  WAVES_LABELS,
  WEATHER_LABELS,
  type DiveFileInfo,
  type DiveMixture,
  type DiveProfileInfo,
  type Recording,
  type RecordingDecoModel,
  type RecordingDevice,
} from "@/lib/api/dives";
import { gearItemLabel } from "@/lib/api/gear";
import { labelOrFallback } from "@/lib/api/labels";
import type { LogbookImportChange } from "@/lib/api/logbook-import";
import type { SpeciesSummary } from "@/lib/api/species";
import {
  formatDiveDateTime,
  formatDurationHoursMinutes,
} from "@/lib/date-time";
import {
  GAS_ROLE_LABELS,
  TANK_USAGE_LABELS,
  gasName,
} from "@/lib/dive-mixtures";
import { PROFILE_CHANNELS } from "@/lib/dive-profile";
import {
  decoModelLabel,
  MODE_LABELS,
  recordingDeviceLabel,
  SALINITY_LABELS,
  UNNAMED_DEVICE_LABEL,
} from "@/lib/dive-recordings";
import { countNoun } from "@/lib/format";
import { speciesDisplayName } from "@/lib/species";
import {
  formatAltitude,
  formatDepth,
  formatPressure,
  formatTemperature,
  formatVisibility,
  formatWeight,
  type UnitSystem,
} from "@/lib/units";

/**
 * One line of a modified dive's panel: an element of a list added or removed, as
 * a sentence, or a value with what it was and what it becomes.
 */
export type ImportChangeRow =
  | { kind: "element"; text: string }
  | { kind: "value"; label: string; before: string; after: string };

type Format = (value: unknown, units: UnitSystem) => string;

interface Member {
  label: string;
  format: Format;
}

// A value this build cannot read as its member's type, or a member it has no name
// for: shown as the API sent it, since the list is the writer's.
function asSent(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

const plain: Format = (value) => asSent(value);

const measured =
  (format: (value: number, units: UnitSystem) => string): Format =>
  (value, units) =>
    typeof value === "number" ? format(value, units) : asSent(value);

const worded =
  (labels: Readonly<Partial<Record<string, string>>>): Format =>
  (value) =>
    typeof value === "string" ? labelOrFallback(labels, value) : asSent(value);

const when: Format = (value) =>
  typeof value === "string" ? formatDiveDateTime(value) : asSent(value);

const seconds: Format = measured((value) => formatDurationHoursMinutes(value));
const milliseconds: Format = measured((value) =>
  formatDurationHoursMinutes(Math.round(value / 1000)),
);
const depth: Format = measured((value, units) => formatDepth(value, units));
const temperature: Format = measured((value, units) =>
  formatTemperature(value, units),
);
const pressure: Format = measured((value, units) =>
  formatPressure(value, units),
);
const percent: Format = measured((value) => `${value}%`);

// A link to a record held by uuid alone, which names nothing a diver can read:
// that the dive has one is what can be said without reading another route.
const linked: Format = () => "Linked";

// A profile's curves, as the dive page's chart names them.
const curveName: Format = worded(
  Object.fromEntries(
    Object.values(PROFILE_CHANNELS).map(({ key, label }) => [key, label]),
  ),
);

// The dive's own members, in the dive form's words.
const DIVE_MEMBERS: Record<string, Member> = {
  start_time: { label: "Start time", format: when },
  dive_number: { label: "Dive number", format: plain },
  submerged_time: { label: "Dive time", format: seconds },
  max_depth: { label: "Maximum depth", format: depth },
  avg_depth: { label: "Average depth", format: depth },
  bottom_temperature: { label: "Bottom temperature", format: temperature },
  air_temperature: { label: "Air temperature", format: temperature },
  visibility: {
    label: "Visibility",
    format: measured((value, units) => formatVisibility(value, units)),
  },
  altitude: {
    label: "Altitude",
    format: measured((value, units) => formatAltitude(value, units)),
  },
  weight: {
    label: "Weight",
    format: measured((value, units) => formatWeight(value, units)),
  },
  water_type: { label: "Water type", format: worded(WATER_TYPE_LABELS) },
  type: { label: "Dive type", format: worded(DIVE_TYPE_LABELS) },
  entry_type: { label: "Entry type", format: worded(ENTRY_TYPE_LABELS) },
  waves: { label: "Waves", format: worded(WAVES_LABELS) },
  current: { label: "Current", format: worded(CURRENT_LABELS) },
  weather: { label: "Weather", format: worded(WEATHER_LABELS) },
  boat_name: { label: "Boat name", format: plain },
  notes: { label: "Notes", format: plain },
  rating: { label: "Rating", format: measured((value) => `${value} / 5`) },
  entry_latitude: { label: "Entry latitude", format: plain },
  entry_longitude: { label: "Entry longitude", format: plain },
  exit_latitude: { label: "Exit latitude", format: plain },
  exit_longitude: { label: "Exit longitude", format: plain },
  trip_uuid: { label: "Trip", format: linked },
  course_uuid: { label: "Course", format: linked },
  contact_uuid: { label: "Dive center", format: linked },
};

const MIXTURE_MEMBERS: Record<string, Member> = {
  gas_number: { label: "Gas number", format: plain },
  volume: { label: "Volume", format: measured((value) => `${value} L`) },
  start_pressure: { label: "Start pressure", format: pressure },
  end_pressure: { label: "End pressure", format: pressure },
  oxygen: { label: "O₂", format: percent },
  helium: { label: "He", format: percent },
  po2_limit: {
    label: "ppO₂ limit",
    format: measured((value) => `${value} bar`),
  },
  role: { label: "Role", format: worded(GAS_ROLE_LABELS) },
  usage: { label: "Usage", format: worded(TANK_USAGE_LABELS) },
  gear_item: {
    label: "Cylinder",
    format: (value) =>
      gearItemLabel(value as { name: string; brand?: string | null }),
  },
};

const RECORDING_MEMBERS: Record<string, Member> = {
  mode: { label: "Mode", format: worded(MODE_LABELS) },
  salinity: { label: "Salinity", format: worded(SALINITY_LABELS) },
  started_at: { label: "Start", format: when },
  cns_start: { label: "CNS at the start", format: percent },
  cns_end: { label: "CNS at the end", format: percent },
  otu_start: { label: "OTU at the start", format: plain },
  otu_end: { label: "OTU at the end", format: plain },
  surface_pressure_bar: {
    label: "Surface pressure",
    format: measured((value) => `${value} bar`),
  },
  device: {
    label: "Device",
    format: (value) =>
      recordingDeviceLabel(value as RecordingDevice) ?? UNNAMED_DEVICE_LABEL,
  },
  deco_model: {
    label: "Decompression model",
    format: (value) =>
      decoModelLabel(value as RecordingDecoModel) ?? asSent(value),
  },
  profile: {
    label: "Profile",
    format: (value, units) =>
      recordingProfileSummary(value as DiveProfileInfo, units),
  },
};

const DEVICE_MEMBERS: Record<string, Member> = {
  brand: { label: "Brand", format: plain },
  model: { label: "Model", format: plain },
  serial: { label: "Serial number", format: plain },
  firmware: { label: "Firmware", format: plain },
  name: { label: "Name", format: plain },
  dive_number: { label: "Its dive number", format: plain },
};

const DECO_MODEL_MEMBERS: Record<string, Member> = {
  algorithm: { label: "Algorithm", format: plain },
  name: { label: "Name", format: plain },
  gf_low: { label: "GF low", format: percent },
  gf_high: { label: "GF high", format: percent },
  conservatism: { label: "Conservatism", format: plain },
};

const PROFILE_MEMBERS: Record<string, Member> = {
  duration: { label: "Span", format: milliseconds },
  depth_sample_count: { label: "Samples", format: plain },
  event_count: { label: "Markers", format: plain },
  max_depth: { label: "Maximum depth", format: depth },
  max_ceiling: { label: "Deepest ceiling", format: depth },
  min_temperature: { label: "Lowest temperature", format: temperature },
  max_temperature: { label: "Highest temperature", format: temperature },
  min_pressure: { label: "Lowest pressure", format: pressure },
  max_pressure: { label: "Highest pressure", format: pressure },
  max_heart_rate: {
    label: "Highest heart rate",
    format: measured((value) => `${value} bpm`),
  },
  average_heart_rate: {
    label: "Average heart rate",
    format: measured((value) => `${value} bpm`),
  },
};

/** What a recording's samples come to, on one line: span, depth and how many. */
export function recordingProfileSummary(
  profile: DiveProfileInfo,
  units: UnitSystem,
): string {
  return [
    formatDurationHoursMinutes(Math.round(profile.duration / 1000)),
    profile.max_depth != null ? formatDepth(profile.max_depth, units) : null,
    countNoun(profile.depth_sample_count, "sample"),
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/** A cylinder on one line: its gas, then its vessel's size where it has one. */
export function mixtureSummary(mixture: DiveMixture): string {
  return [
    gasName(mixture.oxygen, mixture.helium) ?? "Gas not recorded",
    mixture.volume != null ? `${mixture.volume} L` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");
}

function recordingSummary(recording: Recording): string {
  return [
    recordingDeviceLabel(recording.device) ?? UNNAMED_DEVICE_LABEL,
    ...(recording.files ?? []).map((file) => file.original_filename),
  ].join(", ");
}

interface Element {
  noun: string;
  summary?: (value: never) => string;
}

// A dive's lists, whose elements are added and removed whole.
const DIVE_ELEMENTS: Record<string, Element> = {
  dive_sites: {
    noun: "Dive site",
    summary: (site: { name: string }) => site.name,
  },
  gear_items: {
    noun: "Gear",
    summary: (item: { name: string; brand?: string | null }) =>
      gearItemLabel(item),
  },
  sightings: {
    noun: "Species",
    summary: (sighting: SpeciesSummary) => speciesDisplayName(sighting),
  },
  tags: { noun: "Tag", summary: (tag: string) => tag },
  people: { noun: "Person" },
};

function elementRow(
  noun: string,
  change: LogbookImportChange,
  summary?: (value: never) => string,
): ImportChangeRow {
  const removed = change.after === null;
  const value = (removed ? change.before : change.after) as never;
  const text = summary?.(value);
  return {
    kind: "element",
    text: `${noun} ${removed ? "removed" : "added"}${text ? ` — ${text}` : ""}`,
  };
}

function valueRow(
  label: string,
  { before, after }: LogbookImportChange,
  format: Format,
  units: UnitSystem,
): ImportChangeRow {
  const shown = (value: unknown) =>
    value === null ? "—" : format(value, units);
  return { kind: "value", label, before: shown(before), after: shown(after) };
}

const isIndex = (segment: string | undefined) =>
  segment !== undefined && /^\d+$/.test(segment);

// Whether one of the two sides is absent: an element added or removed, rather
// than a list position whose value moved, which is a change of a value like any.
const isWholeElement = ({ before, after }: LogbookImportChange) =>
  before === null || after === null;

function recordingRow(
  index: number,
  rest: string[],
  change: LogbookImportChange,
  units: UnitSystem,
): ImportChangeRow | null {
  const prefix = `Recording ${index + 1}: `;
  const [first, second, third] = rest;
  if (rest.length === 0) {
    return elementRow(`Recording ${index + 1}`, change, recordingSummary);
  }
  if (first === "files" && isIndex(second)) {
    if (rest.length === 2) {
      return elementRow(
        "File",
        change,
        (file: DiveFileInfo) => file.original_filename,
      );
    }
    return rest.length === 3 && third === "original_filename"
      ? valueRow(`${prefix}File name`, change, plain, units)
      : null;
  }
  if (rest.length === 1 && first in RECORDING_MEMBERS) {
    const { label, format } = RECORDING_MEMBERS[first];
    return valueRow(`${prefix}${label}`, change, format, units);
  }
  if (first === "profile" && second === "channels" && isIndex(third)) {
    return isWholeElement(change)
      ? elementRow(`${prefix}Curve`, change, (channel: unknown) =>
          curveName(channel, units),
        )
      : valueRow(`${prefix}Curve`, change, curveName, units);
  }
  const nested = {
    device: DEVICE_MEMBERS,
    deco_model: DECO_MODEL_MEMBERS,
    profile: PROFILE_MEMBERS,
  }[first];
  if (nested && rest.length === 2 && second in nested) {
    const { label, format } = nested[second];
    const owner = RECORDING_MEMBERS[first].label;
    return valueRow(`${prefix}${owner} ${lower(label)}`, change, format, units);
  }
  return null;
}

const lower = (label: string) =>
  /^[A-Z][a-z]/.test(label)
    ? label.charAt(0).toLowerCase() + label.slice(1)
    : label;

function mixtureRow(
  index: number,
  rest: string[],
  change: LogbookImportChange,
  units: UnitSystem,
): ImportChangeRow | null {
  const tank = `Tank ${index + 1}`;
  if (rest.length === 0) {
    return elementRow(tank, change, mixtureSummary);
  }
  const member = rest.length === 1 ? MIXTURE_MEMBERS[rest[0]] : undefined;
  return member
    ? valueRow(`${tank}: ${member.label}`, change, member.format, units)
    : null;
}

function labelledRow(
  change: LogbookImportChange,
  units: UnitSystem,
): ImportChangeRow | null {
  const [head, second, ...rest] = change.member.split("/");
  if (second === undefined) {
    const member = DIVE_MEMBERS[head];
    return member ? valueRow(member.label, change, member.format, units) : null;
  }
  if (!isIndex(second)) return null;
  const index = Number(second);
  if (head === "recordings") return recordingRow(index, rest, change, units);
  if (head === "mixtures") return mixtureRow(index, rest, change, units);
  const element = DIVE_ELEMENTS[head];
  if (!element || rest.length > 0) return null;
  return isWholeElement(change)
    ? elementRow(element.noun, change, element.summary)
    : valueRow(element.noun, change, plain, units);
}

/**
 * One entry of a modified dive's `changes`, in the diver's words and units.
 *
 * Never drops an entry: the list is the writer's, and a build that predates a
 * member shows it by its path rather than swallowing what the import does.
 */
export function describeImportChange(
  change: LogbookImportChange,
  units: UnitSystem,
): ImportChangeRow {
  return (
    labelledRow(change, units) ?? valueRow(change.member, change, plain, units)
  );
}
