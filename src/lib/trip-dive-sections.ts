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

function diveDay(dive: Dive): string {
  return splitStartTime(dive.start_time).localDateTime.slice(0, 10);
}

/**
 * The trip's parts and dives as a run of sections, newest first as the dives
 * come: a section for every part, and the dives no part's dates cover between
 * them, a run of neighbours to one section.
 *
 * A dive is the first part's, in the diver's order, whose dates cover the dive's
 * own wall-clock day - the day the diver was there, not the viewer's. A part
 * sits where its first dive falls; one holding none, where its last day falls
 * among the dives; and one with no dates either, just above the part it follows
 * in the diver's order - below the one it precedes when it leads.
 */
export function tripDiveSections(
  dives: Dive[],
  parts: TripPart[],
): TripDiveSection[] {
  const partSections = parts.map((part, partIndex) => ({
    kind: "part" as const,
    part,
    partIndex,
    dives: [] as Dive[],
  }));
  // Whether a part holds a dive is only known once every dive is read, so the
  // dated parts are kept by their last day and the empty ones slotted in after.
  const pending = partSections
    .map((section) => ({
      section,
      day: section.part.end_date ?? section.part.start_date,
    }))
    .filter((entry): entry is typeof entry & { day: string } => !!entry.day);
  const placed = new Set<number>();
  const sections: TripDiveSection[] = [];

  for (const dive of dives) {
    const day = diveDay(dive);
    const partIndex = parts.findIndex((part) => partCovers(part, day));
    if (partIndex !== -1) {
      partSections[partIndex].dives.push(dive);
      if (!placed.has(partIndex)) {
        placed.add(partIndex);
        sections.push(partSections[partIndex]);
      }
      continue;
    }
    const last = sections[sections.length - 1];
    if (last?.kind === "loose") last.dives.push(dive);
    else sections.push({ kind: "loose", dives: [dive] });
  }

  // A dive-less dated part goes above the first section that is wholly older
  // than its last day, splitting a run of loose dives where it falls inside one.
  for (const { section, day } of pending) {
    if (placed.has(section.partIndex)) continue;
    let at = sections.length;
    for (let i = 0; i < sections.length; i += 1) {
      const current = sections[i];
      if (current.kind === "part") {
        const newest = current.dives[0];
        const currentDay = newest
          ? diveDay(newest)
          : (current.part.end_date ?? current.part.start_date);
        if (currentDay && currentDay < day) {
          at = i;
          break;
        }
        continue;
      }
      const split = current.dives.findIndex((dive) => diveDay(dive) < day);
      if (split === -1) continue;
      if (split > 0) {
        sections.splice(i + 1, 0, {
          kind: "loose",
          dives: current.dives.splice(split),
        });
        at = i + 1;
      } else {
        at = i;
      }
      break;
    }
    sections.splice(at, 0, section);
    placed.add(section.partIndex);
  }

  // Dateless parts, by their neighbours in the diver's order. Shown newest
  // first, the part a dateless one follows sits below it.
  for (const section of partSections) {
    if (placed.has(section.partIndex)) continue;
    const sectionAt = (partIndex: number) =>
      sections.findIndex((s) => s.kind === "part" && s.partIndex === partIndex);
    let at = -1;
    for (let i = section.partIndex - 1; i >= 0 && at === -1; i -= 1) {
      if (placed.has(i)) at = sectionAt(i);
    }
    if (at === -1) {
      for (let i = section.partIndex + 1; i < parts.length; i += 1) {
        if (placed.has(i)) {
          at = sectionAt(i) + 1;
          break;
        }
      }
    }
    sections.splice(at === -1 ? sections.length : at, 0, section);
    placed.add(section.partIndex);
  }
  return sections;
}
