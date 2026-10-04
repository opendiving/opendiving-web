// A trip page lists its dives under the parts they were made on. Nothing stores
// which part a dive belongs to: it is read off the dive's own day against each
// part's dates, so editing a part's dates regroups the dives with no write.

import type { Dive } from "@/lib/api/dives";
import type { TripPart } from "@/lib/api/trips";
import { splitStartTime } from "@/lib/date-time";

export type TripDiveSection =
  | { kind: "part"; part: TripPart; partIndex: number; dives: Dive[] }
  | { kind: "loose"; dives: Dive[] };

// A part with one date covers that day alone, which is how its dates read on
// the page (`formatTripDateRange` prints the one date); a part with none covers
// no day.
function partCovers(part: TripPart, day: string): boolean {
  const start = part.start_date ?? part.end_date;
  const end = part.end_date ?? part.start_date;
  return !!start && !!end && start <= day && day <= end;
}

/**
 * The trip's dives as a run of sections, in the order the dives come: each part
 * that holds a dive where its first dive falls, and the dives no part's dates
 * cover between them, a run of neighbours to one section.
 *
 * A dive is the first part's, in the diver's order, whose dates cover the dive's
 * own wall-clock day - the day the diver was there, not the viewer's. Parts
 * holding no dive are left out; the trip's information card still lists them.
 */
export function tripDiveSections(
  dives: Dive[],
  parts: TripPart[],
): TripDiveSection[] {
  const sections: TripDiveSection[] = [];
  const byPart = new Map<number, Dive[]>();
  for (const dive of dives) {
    const day = splitStartTime(dive.start_time).localDateTime.slice(0, 10);
    const partIndex = parts.findIndex((part) => partCovers(part, day));
    if (partIndex === -1) {
      const last = sections[sections.length - 1];
      if (last?.kind === "loose") last.dives.push(dive);
      else sections.push({ kind: "loose", dives: [dive] });
      continue;
    }
    const partDives = byPart.get(partIndex);
    if (partDives) {
      partDives.push(dive);
      continue;
    }
    const section = {
      kind: "part" as const,
      part: parts[partIndex],
      partIndex,
      dives: [dive],
    };
    byPart.set(partIndex, section.dives);
    sections.push(section);
  }
  return sections;
}
