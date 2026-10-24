// A dive draft and the create form, both ways. A draft is the form's state with
// nothing required, so the way in keeps whatever the API takes from a half-filled
// form and drops only what it would refuse - and the way out seeds every field, as
// `diveToFormValues` does for an edit.

import type {
  DiveDraftMixture,
  DiveDraftSighting,
  DiveDraftValues,
  DiveDraftValuesRead,
} from "@/lib/api/dive-drafts";
import type { GearItemInfo } from "@/lib/api/gear";
import { formatDurationForForm, parseFormDuration } from "@/lib/date-time";
import {
  boatNameOrNull,
  emptyDiveFormValues,
  isFormDuration,
  isOffsetStartTime,
  normalizeMixtures,
  type DiveCreateInput,
  type DiveMixtureInput,
  type SightingInput,
} from "@/lib/validations/dive";

const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

// The API's integer members refuse a fraction, which a box can hold mid-edit.
const whole = (value: unknown): number | undefined =>
  Number.isInteger(value) ? (value as number) : undefined;

// `""` is a select's "Not recorded"; every other value a select holds is a word
// of its vocabulary.
const word = <T extends string>(value: T | "" | null | undefined) =>
  value ? value : undefined;

const uuid = (value: string | null | undefined) => value || undefined;

/** Drops the keys a draft does not hold, so the body names only what it carries. */
function defined<T extends object>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

/**
 * The create form's values as a draft's, whether or not they would validate as a
 * dive. A member is left out where the form holds nothing, or where it holds what
 * the API would refuse - a start time without an offset, a dive time it cannot
 * read, a fraction in a whole-number box, a sighting without a species, a person
 * entry without a person - and every other value goes as typed, out-of-range
 * figures included: the dive is validated when the draft is logged.
 */
export function buildDiveDraftValues(data: DiveCreateInput): DiveDraftValues {
  const mixtures: DiveDraftMixture[] = normalizeMixtures(
    data.mixtures ?? [],
  ).map((mixture) =>
    defined({
      volume: finite(mixture.volume),
      start_pressure: finite(mixture.start_pressure),
      end_pressure: finite(mixture.end_pressure),
      oxygen: finite(mixture.oxygen),
      helium: finite(mixture.helium),
      po2_limit: finite(mixture.po2_limit),
      gas_number: whole(mixture.gas_number),
      role: mixture.role,
      usage: mixture.usage,
      gear_item_uuid: mixture.gear_item_uuid,
    }),
  );
  const sightings: DiveDraftSighting[] = (data.sightings ?? [])
    .filter((sighting) => !!sighting.species_uuid)
    .map((sighting) =>
      defined({
        species_uuid: sighting.species_uuid,
        count: whole(sighting.count),
        abundance: sighting.abundance,
        notes: sighting.notes,
      }),
    );

  return defined({
    dive_number: whole(data.dive_number),
    start_time:
      data.start_time && isOffsetStartTime(data.start_time)
        ? data.start_time
        : undefined,
    submerged_time:
      data.submerged_time && isFormDuration(data.submerged_time)
        ? parseFormDuration(data.submerged_time)
        : undefined,
    max_depth: finite(data.max_depth),
    avg_depth: finite(data.avg_depth),
    bottom_temperature: finite(data.bottom_temperature),
    visibility: whole(data.visibility),
    weight: finite(data.weight),
    water_type: word(data.water_type),
    altitude: whole(data.altitude),
    type: word(data.type),
    rating: whole(data.rating),
    air_temperature: finite(data.air_temperature),
    current: word(data.current),
    waves: word(data.waves),
    weather: word(data.weather),
    entry_type: word(data.entry_type),
    boat_name: boatNameOrNull(data.boat_name ?? "") ?? undefined,
    notes: data.notes || undefined,
    trip_uuid: uuid(data.trip_uuid),
    course_uuid: uuid(data.course_uuid),
    contact_uuid: uuid(data.contact_uuid),
    mixtures: mixtures.length > 0 ? mixtures : undefined,
    dive_site_uuids: data.dive_site_uuids?.length
      ? data.dive_site_uuids
      : undefined,
    gear_item_uuids: data.gear_item_uuids?.length
      ? data.gear_item_uuids
      : undefined,
    sightings: sightings.length > 0 ? sightings : undefined,
    people: data.people?.filter((person) => !!person.person_uuid).length
      ? data.people.filter((person) => !!person.person_uuid)
      : undefined,
    tags: data.tags?.length ? data.tags : undefined,
  });
}

/**
 * A draft read back as the create form holds it: every field seeded, the empty
 * ones as `emptyDiveFormValues` holds them. A missing start time stays empty
 * rather than becoming now, since the draft is the form's state. `vessels` are the
 * gear items its tanks link, which a row carries to show the link and its
 * capacity; a link whose item did not resolve keeps its uuid and shows none.
 */
export function draftToFormValues(
  values: DiveDraftValuesRead,
  vessels: readonly GearItemInfo[] = [],
): DiveCreateInput {
  const vessel = (gearItemUuid: string | null) =>
    vessels.find((item) => item.uuid === gearItemUuid) ?? null;
  const mixtures: DiveMixtureInput[] = (values.mixtures ?? []).map((m) => ({
    volume: m.volume ?? "",
    start_pressure: m.start_pressure ?? "",
    end_pressure: m.end_pressure ?? "",
    oxygen: m.oxygen ?? "",
    helium: m.helium ?? "",
    po2_limit: m.po2_limit ?? "",
    gas_number: m.gas_number ?? undefined,
    role: (m.role ?? "") as DiveMixtureInput["role"],
    usage: (m.usage ?? "") as DiveMixtureInput["usage"],
    gear_item_uuid: m.gear_item_uuid ?? "",
    gear_item: vessel(m.gear_item_uuid),
  }));
  const sightings: SightingInput[] = (values.sightings ?? []).map((s) => ({
    species_uuid: s.species_uuid,
    ...(s.count != null && { count: s.count }),
    ...(s.abundance != null && {
      abundance: s.abundance as SightingInput["abundance"],
    }),
    notes: s.notes,
  }));
  const pick = <T>(value: T | null) => value ?? undefined;
  type Form = DiveCreateInput;

  return {
    ...emptyDiveFormValues(),
    dive_number: pick(values.dive_number) as Form["dive_number"],
    start_time: values.start_time ?? "",
    submerged_time:
      values.submerged_time != null
        ? formatDurationForForm(values.submerged_time)
        : "",
    max_depth: pick(values.max_depth),
    avg_depth: pick(values.avg_depth),
    bottom_temperature: pick(values.bottom_temperature),
    visibility: pick(values.visibility),
    weight: pick(values.weight),
    water_type: (values.water_type ?? "") as Form["water_type"],
    altitude: pick(values.altitude),
    type: (values.type ?? "") as Form["type"],
    rating: values.rating,
    air_temperature: pick(values.air_temperature),
    current: (values.current ?? "") as Form["current"],
    waves: (values.waves ?? "") as Form["waves"],
    weather: (values.weather ?? "") as Form["weather"],
    entry_type: (values.entry_type ?? "") as Form["entry_type"],
    boat_name: values.boat_name ?? "",
    notes: values.notes ?? "",
    trip_uuid: pick(values.trip_uuid),
    course_uuid: pick(values.course_uuid),
    contact_uuid: values.contact_uuid,
    people: values.people ?? [],
    dive_site_uuids: values.dive_site_uuids ?? [],
    gear_item_uuids: values.gear_item_uuids ?? [],
    sightings,
    tags: values.tags ?? [],
    mixtures,
  };
}

/** The uuids of the gear items a draft's tanks link, for `draftToFormValues`. */
export function draftVesselUuids(values: DiveDraftValuesRead): string[] {
  return [
    ...new Set(
      (values.mixtures ?? [])
        .map((mixture) => mixture.gear_item_uuid)
        .filter((id): id is string => !!id),
    ),
  ];
}
