import type { ConditionsLookup, Dive, DiveConditions } from "@/lib/api/dives";
import type { LogbookImportDive } from "@/lib/api/logbook-import";

// A hand-logged dive with every required member and nothing else, so a test
// states only the fields it is about. Spelled out rather than cast: a member
// added to `Dive` should break here, not slip past every fixture built on it.
export function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "d1",
    dive_number: 1,
    start_time: "2026-04-04T10:04:47+02:00",
    submerged_time: 2700,
    dive_sites: [],
    gear_items: [],
    notes: "",
    user_uuid: "u1",
    created_at: "2026-04-04T08:04:47Z",
    mixtures: [],
    ...overrides,
  };
}

// What Open-Meteo answered for the Blue Hole, Dahab, at 10:00 +03:00 on
// 2026-09-15, with the dive's air temperature, weather and waves filled from it.
export function diveConditions(
  overrides: Partial<DiveConditions> = {},
): DiveConditions {
  return {
    provider: "open-meteo",
    fetched_at: "2026-09-15T07:02:11+00:00",
    at: "2026-09-15T10:00:00+03:00",
    utc_offset_minutes: 180,
    position: { latitude: 28.57, longitude: 34.54 },
    attribution:
      "[Weather data by Open-Meteo.com](https://open-meteo.com/) " +
      "([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), " +
      "with weather, waves and tide times derived from it",
    weather: {
      model: "best_match",
      air_temperature: 38.1,
      wind_speed: 5.9,
      wind_direction: 22,
      weather_code: 0,
    },
    sea: {
      model: "meteofrance_wave",
      tide_state: "high",
      previous_extreme: {
        kind: "high",
        at: "2026-09-15T06:30:00+00:00",
        height: 0.2,
      },
      next_extreme: {
        kind: "low",
        at: "2026-09-15T15:00:00+03:00",
        height: -0.3,
      },
      sea_surface_temperature: 27.7,
      wave_height: 0.62,
    },
    filled: { air_temperature: 38.1, weather: "clear", waves: "slight" },
    ...overrides,
  };
}

// What the dive form's preview lookup answers, filling what `filled` names.
export function conditionsLookup(
  filled: Partial<ConditionsLookup["filled"]> = {},
): ConditionsLookup {
  const { attribution, at, utc_offset_minutes } = diveConditions();
  return {
    provider: "open-meteo",
    attribution,
    at,
    utc_offset_minutes,
    filled: { air_temperature: null, weather: null, waves: null, ...filled },
  };
}

// One new dive in an import, as the review lists it.
export function importDiveRow(
  overrides: Partial<LogbookImportDive> = {},
): LogbookImportDive {
  return {
    uuid: "11111111-1111-4111-8111-111111111111",
    outcome: "new",
    dive: dive({
      uuid: "11111111-1111-4111-8111-111111111111",
      start_time: "2026-09-07T11:04:58+03:00",
      submerged_time: 4063,
      max_depth: 21.8,
    }),
    changes: [],
    start_time: "2026-09-07T11:04:58+03:00",
    device: null,
    members: [0],
    reason: null,
    ...overrides,
  };
}
