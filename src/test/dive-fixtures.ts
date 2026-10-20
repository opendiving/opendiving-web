import type { Dive } from "@/lib/api/dives";
import type { ImportDiveReport } from "@/lib/api/logbook-import";

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

// One created dive in an import plan or result, as the review table lists it.
export function importDiveReport(
  overrides: Partial<ImportDiveReport> = {},
): ImportDiveReport {
  return {
    uuid: "11111111-1111-4111-8111-111111111111",
    outcome: "created",
    files_added: 0,
    recordings_added: 0,
    reason: null,
    start_time: "2026-09-07T11:04:58+03:00",
    submerged_time: 4063,
    max_depth: 21.8,
    device: null,
    members: [0],
    notes: [],
    notes_truncated: 0,
    ...overrides,
  };
}
