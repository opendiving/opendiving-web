import { describe, expect, it } from "vitest";
import {
  collectionLabel,
  collectionRowIsEmpty,
  fileRestoreHint,
  importTotals,
  noteIsWarning,
  truncatedNotesSentence,
} from "./logbook-import";
import type {
  ImportCollectionReport,
  ImportReport,
} from "@/lib/api/logbook-import";

function row(
  collection: string,
  counts: Partial<Omit<ImportCollectionReport, "collection">> = {},
): ImportCollectionReport {
  return {
    collection,
    created: 0,
    linked: 0,
    restored: 0,
    skipped: 0,
    ...counts,
  };
}

function report(overrides: Partial<ImportReport> = {}): ImportReport {
  return {
    collections: [],
    files: { referenced: 0, restored: 0, not_contained: 0, skipped: 0 },
    notes: [],
    notes_truncated: 0,
    ...overrides,
  };
}

describe("collectionLabel", () => {
  it("names each of the ten envelope collections", () => {
    // The envelope's own order, which is the order the API returns them in.
    expect(
      [
        "dives",
        "trips",
        "courses",
        "sites",
        "species",
        "gear",
        "gear_sets",
        "gear_service_schedules",
        "gear_service_records",
        "certifications",
      ].map(collectionLabel),
    ).toEqual([
      "Dives",
      "Trips",
      "Courses",
      "Dive sites",
      "Marine life",
      "Gear",
      "Gear sets",
      "Service schedules",
      "Service records",
      "Certifications",
    ]);
  });

  it("renders a collection this build has never heard of", () => {
    // A newer API that grew an eleventh collection must produce a readable row,
    // not a blank heading over correct numbers.
    expect(collectionLabel("dive_computers")).toBe("Dive computers");
  });
});

describe("importTotals", () => {
  it("keeps restored as its own figure rather than folding it into created", () => {
    // The whole reason the API keeps the four counts disjoint: a diver restoring
    // a backup is entitled to see how much of it actually came back, and a total
    // that absorbed restores into "created" would destroy exactly that.
    const totals = importTotals(
      report({
        collections: [
          row("dives", { created: 4, restored: 2, skipped: 1 }),
          row("sites", { created: 1, linked: 3 }),
        ],
      }),
    );

    expect(totals).toEqual({
      created: 5,
      linked: 3,
      restored: 2,
      skipped: 1,
    });
  });

  it("is all zeroes for a report carrying no collections", () => {
    expect(importTotals(report())).toEqual({
      created: 0,
      linked: 0,
      restored: 0,
      skipped: 0,
    });
  });
});

describe("collectionRowIsEmpty", () => {
  it("is true only when all four counts are zero", () => {
    expect(collectionRowIsEmpty(row("dives"))).toBe(true);
    expect(collectionRowIsEmpty(row("dives", { skipped: 1 }))).toBe(false);
    expect(collectionRowIsEmpty(row("dives", { restored: 1 }))).toBe(false);
  });
});

describe("noteIsWarning", () => {
  it("warns only where the diver ends up with less than the document described", () => {
    expect(
      [
        "record_skipped",
        "value_dropped",
        "reference_unresolved",
        "species_unresolved",
        "file_skipped",
      ].every(noteIsWarning),
    ).toBe(true);
  });

  it("does not warn about the import working as designed", () => {
    // `file_not_contained` is the load-bearing one: it is the *expected* state of
    // every referenced file when a bare document rather than an archive was
    // imported, so colouring it as a failure makes the ordinary case look broken.
    // Both remaps are non-errors too - the record imported, under another uuid.
    expect(
      [
        "record_linked",
        "record_restored",
        "record_remapped_references_follow",
        "record_remapped_references_stay",
        "diver_not_applied",
        "file_not_contained",
      ].some(noteIsWarning),
    ).toBe(false);
  });

  it("reads a code from a newer API as information, not alarm", () => {
    expect(noteIsWarning("something_this_build_predates")).toBe(false);
  });
});

describe("truncatedNotesSentence", () => {
  it("says nothing when the list is the whole story", () => {
    expect(truncatedNotesSentence(0)).toBeNull();
  });

  it("says how many are missing, and that the counts are not", () => {
    // Both halves matter: without the first a 600-note import renders 500 notes
    // as if they were all of them, and without the second the diver has no way to
    // know the numbers above are still complete.
    expect(truncatedNotesSentence(112)).toBe(
      "112 further notes are not shown. The counts above are complete.",
    );
  });

  it("does not say '1 further notes'", () => {
    expect(truncatedNotesSentence(1)).toBe(
      "1 further note is not shown. The counts above are complete.",
    );
  });
});

describe("fileRestoreHint", () => {
  it("tells a bare document's importer where the bytes are", () => {
    const hint = fileRestoreHint(
      report({
        files: { referenced: 3, restored: 0, not_contained: 3, skipped: 0 },
      }),
      false,
    );

    expect(hint).toContain("3 files");
    expect(hint).toContain(".zip");
  });

  it("says nothing after an archive import, where the bytes already came", () => {
    expect(
      fileRestoreHint(
        report({
          files: { referenced: 3, restored: 3, not_contained: 0, skipped: 0 },
        }),
        true,
      ),
    ).toBeNull();
  });

  it("says nothing for a document that references no files at all", () => {
    expect(fileRestoreHint(report(), false)).toBeNull();
  });

  it("does not say 'These 1 files'", () => {
    expect(
      fileRestoreHint(
        report({
          files: { referenced: 1, restored: 0, not_contained: 1, skipped: 0 },
        }),
        false,
      ),
    ).toContain("This file is");
  });
});
