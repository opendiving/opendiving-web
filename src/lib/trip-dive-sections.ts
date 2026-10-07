// A trip page lists its dives under the parts they were made on. Nothing stores
// which part a dive belongs to: it is read off the dive's own day against each
// part's dates, so editing a part's dates regroups the dives with no write.

import type { Dive } from "@/lib/api/dives";
import type { TripPart } from "@/lib/api/trips";
import { splitStartTime } from "@/lib/date-time";

export type TripDiveSection =
  | { kind: "part"; part: TripPart; partIndex: number; dives: Dive[] }
  | { kind: "loose"; dives: Dive[] };

// Whole days from `from` to `to`, both bare `YYYY-MM-DD`. Built with
// `Date.UTC` from the digits, never `new Date(dateString)` (DECISIONS.md, "Bare
// `YYYY-MM-DD` dates must not go through `new Date(dateString)`").
function daysBetween(from: string, to: string): number {
  const utc = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/**
 * The index of the part a day falls in, or -1 when none does.
 *
 * A part with both dates covers the days between them, and beats any part with
 * one: a side trip dated inside an open-ended stay is the side trip's. A part
 * with only a start runs on from it - the stretch the diver is still on - and
 * one with only an end runs back to it. Where two such parts both reach a day,
 * the one whose date is nearer has it, so a trip's first part dated from its
 * start and last part dated to its end meet in the middle. A part with no dates
 * covers no day. Ties go to the first part in the diver's order.
 *
 * `opendiving-api` mirrors this rule in `part_for_day` (`crud_dives.py`), for
 * the per-part `candidate_count` on a trip read and the part scope of
 * `POST /trip/{uuid}/dives`, so a change here is owed there.
 */
export function tripPartForDay(parts: TripPart[], day: string): number {
  let best = -1;
  let bestDistance = Infinity;
  parts.forEach((part, index) => {
    const start = part.start_date;
    const end = part.end_date;
    let distance: number;
    if (start && end) {
      if (start > day || day > end) return;
      distance = -1;
    } else if (start) {
      if (start > day) return;
      distance = daysBetween(start, day);
    } else if (end) {
      if (day > end) return;
      distance = daysBetween(day, end);
    } else {
      return;
    }
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function diveDay(dive: Dive): string {
  return splitStartTime(dive.start_time).localDateTime.slice(0, 10);
}

/**
 * The trip's parts and dives as a run of sections, newest first as the dives
 * come: a section for every part, and the dives no part's dates cover between
 * them, a run of neighbours to one section.
 *
 * A dive is the part's whose dates cover its own wall-clock day - the day the
 * diver was there, not the viewer's - by `tripPartForDay`. A part
 * sits where its first dive falls; one holding none, where its last day falls
 * among the dives; and one with no dates either, just above the part it follows
 * in the diver's order - below the one it precedes when it leads.
 *
 * `complete: false` is a list with pages still to load. A dated part holding
 * no loaded dive is then left out unless every day it covers is later than the
 * oldest loaded dive's - its dives may be on the next page, and a part drawn
 * empty and then filled says the wrong thing first. A part with only an end
 * runs back without limit, so it waits for the list to end.
 */
export function tripDiveSections(
  dives: Dive[],
  parts: TripPart[],
  { complete = true }: { complete?: boolean } = {},
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
    const partIndex = tripPartForDay(parts, day);
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

  const oldest = dives.length > 0 ? diveDay(dives[dives.length - 1]) : null;
  const unsettled = new Set(
    complete
      ? []
      : pending
          .filter(({ section }) => {
            const start = section.part.start_date;
            return !start || oldest === null || start <= oldest;
          })
          .map(({ section }) => section.partIndex),
  );

  // A dive-less dated part goes above the first section that is wholly older
  // than its last day, splitting a run of loose dives where it falls inside one.
  for (const { section, day } of pending) {
    if (placed.has(section.partIndex) || unsettled.has(section.partIndex)) {
      continue;
    }
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
    if (placed.has(section.partIndex) || unsettled.has(section.partIndex)) {
      continue;
    }
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
