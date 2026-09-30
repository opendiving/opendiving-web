import { describe, expect, it } from "vitest";
import {
  collectionLabel,
  collectionRowIsEmpty,
  conversionKindLabel,
  conversionKindTone,
  conversionWhereSentence,
  fileRestoreHint,
  importButtonLabel,
  importDiveOutcomeSentence,
  importFileRefusal,
  importMemberNotKeptSentence,
  importSelectionRefusal,
  importTotals,
  isHiddenImportPath,
  isZipFile,
  noteIsWarning,
  reviewCollectionRows,
  truncatedConversionSentence,
  truncatedNotesSentence,
} from "./logbook-import";
import type {
  ConversionNoteGroup,
  ImportCollectionReport,
  ImportDiveReport,
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
    // Null by default: the conversion block exists only when something was
    // converted.
    conversion: null,
    members: [],
    dives: [],
    ...overrides,
  };
}

describe("collectionLabel", () => {
  it("names each envelope collection", () => {
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
        "contacts",
        "people",
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
      "Contacts",
      "People",
    ]);
  });

  it("renders a collection this build has never heard of", () => {
    // A newer API that grew a collection this build does not know must produce a
    // readable row, not a blank heading over correct numbers.
    expect(collectionLabel("dive_computers")).toBe("Dive computers");
  });
});

describe("importTotals", () => {
  it("keeps restored as its own figure rather than folding it into created", () => {
    // The whole reason the API keeps the four counts disjoint: a diver restoring
    // a backup is entitled to see how much of it actually came back, and a total
    // that absorbed restores into "created" would destroy exactly that.
    const totals = importTotals([
      row("dives", { created: 4, restored: 2, skipped: 1 }),
      row("sites", { created: 1, linked: 3 }),
    ]);

    expect(totals).toEqual({
      created: 5,
      linked: 3,
      restored: 2,
      skipped: 1,
    });
  });

  it("is all zeroes for no rows", () => {
    expect(importTotals([])).toEqual({
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
        "check_in_detail_dropped",
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
        // An older writer's axis in seconds or readout on the dive, read as it
        // meant it: nothing lost.
        "read_as_written",
        "diver_not_applied",
        "file_not_contained",
        // The two recording outcomes. A file that matched a dive already in the
        // account was attached to it rather than creating a second one, and a
        // file that matched an existing recording filled that recording's
        // blanks - in both cases the alternative was a duplicate, so the note
        // is reporting the import working, not falling short.
        "recording_attached",
        "recording_filled",
        "check_in_detail_written",
        "portrait_kept",
        // A person linked to the account its entry names: what the file asked
        // for, under the limit a typed username counts against.
        "account_linked",
        // The tags an import adds to the diver's list: the dives carry them, so
        // nothing is lost.
        "tags_created",
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

function group(
  overrides: Partial<ConversionNoteGroup> = {},
): ConversionNoteGroup {
  return {
    kind: "dropped",
    message: "Visibility is a star rating here and has no metric equivalent.",
    count: 1,
    wheres: ["dive/0"],
    ...overrides,
  };
}

describe("conversionKindLabel", () => {
  it("names each kind the converter emits today", () => {
    expect(conversionKindLabel("absent")).toBe("Not recorded");
    expect(conversionKindLabel("inferred")).toBe("Worked out");
    expect(conversionKindLabel("resolved")).toBe("Resolved");
    expect(conversionKindLabel("dropped")).toBe("Dropped");
  });

  it("de-snakes a kind this build has never heard of", () => {
    // The API sends `kind` as an opaque string deliberately: its converter's
    // kind set grew from three to four mid-feature, and the pin deciding which
    // set a build sees moves with no change here. A blank badge would be worse
    // than the raw word.
    expect(conversionKindLabel("partially_carried")).toBe("Partially carried");
  });
});

describe("conversionKindTone", () => {
  it("is a warning only where the source recorded something that was lost", () => {
    expect(conversionKindTone("dropped")).toBe("warning");
  });

  it("keeps the converter's own working plain, and an absence quietest", () => {
    // `inferred` and `resolved` are the converter explaining itself rather than
    // reporting a loss, and `absent` is a property of the file: the source never
    // recorded the thing at all.
    expect(conversionKindTone("inferred")).toBe("neutral");
    expect(conversionKindTone("resolved")).toBe("neutral");
    expect(conversionKindTone("absent")).toBe("muted");
  });

  it("reads a kind from a newer converter as information, not alarm", () => {
    // The `noteIsWarning` stance, and reachable without anyone touching this
    // repository - which is the whole reason it is here.
    expect(conversionKindTone("stretched")).toBe("neutral");
  });
});

describe("conversionWhereSentence", () => {
  it("says how many places raised it, and where three of them were", () => {
    expect(
      conversionWhereSentence(
        group({ count: 15, wheres: ["dive/0", "dive/1", "dive/2"] }),
      ),
    ).toBe("15 places — dive/0, dive/1, dive/2 and 12 more");
  });

  it("does not claim more when it listed all of them", () => {
    expect(
      conversionWhereSentence(
        group({ count: 2, wheres: ["dive/0", "dive/3"] }),
      ),
    ).toBe("2 places — dive/0, dive/3");
  });

  it("does not say '1 places'", () => {
    expect(conversionWhereSentence(group({ count: 1 }))).toBe(
      "1 place — dive/0",
    );
  });

  it("says the count alone when the converter named no path", () => {
    expect(conversionWhereSentence(group({ count: 4, wheres: [] }))).toBe(
      "4 places",
    );
  });
});

describe("truncatedConversionSentence", () => {
  it("says nothing when every finding is on screen", () => {
    expect(truncatedConversionSentence(0)).toBeNull();
  });

  it("says how many are missing, and that the record counts are not", () => {
    const sentence = truncatedConversionSentence(7)!;
    expect(sentence).toContain("7 further findings are not shown");
    expect(sentence).toContain("record counts above are complete");
  });

  it("does not say '1 further findings'", () => {
    expect(truncatedConversionSentence(1)).toContain(
      "1 further finding is not shown",
    );
  });
});

function dive(overrides: Partial<ImportDiveReport> = {}): ImportDiveReport {
  return {
    uuid: "11111111-1111-4111-8111-111111111111",
    outcome: "created",
    files_added: 0,
    recordings_added: 0,
    reason: null,
    start_time: "2026-09-07T11:04:58+03:00",
    duration: 4063,
    max_depth: 21.8,
    device: null,
    members: [0],
    ...overrides,
  };
}

describe("reviewCollectionRows", () => {
  const counts = [
    row("dives", { created: 23, skipped: 24 }),
    row("sites", { linked: 1 }),
    row("trips"),
  ];

  it("leaves the dives row to the dive rows wherever there are any", () => {
    // `collections` counts a pair's second file as a skipped dive; its row says
    // "New". Showing both is "Skipped 24" under 23 new dives.
    expect(
      reviewCollectionRows(
        report({ collections: counts, dives: [dive()] }),
      ).map((r) => r.collection),
    ).toEqual(["sites"]);
  });

  it("keeps the dives row where there are no dive rows to report them", () => {
    expect(
      reviewCollectionRows(report({ collections: counts })).map(
        (r) => r.collection,
      ),
    ).toEqual(["dives", "sites"]);
  });

  it("is empty when nothing but dives counts", () => {
    expect(
      reviewCollectionRows(
        report({
          collections: [row("dives", { created: 2 })],
          dives: [dive()],
        }),
      ),
    ).toEqual([]);
  });
});

describe("importDiveOutcomeSentence", () => {
  it("says each outcome in the diver's terms", () => {
    expect(importDiveOutcomeSentence(dive())).toBe("New");
    expect(importDiveOutcomeSentence(dive({ outcome: "restored" }))).toBe(
      "Brought back from deletion",
    );
    expect(importDiveOutcomeSentence(dive({ outcome: "linked" }))).toBe(
      "Already in your logbook",
    );
  });

  it("says what an updated dive gains", () => {
    expect(
      importDiveOutcomeSentence(dive({ outcome: "updated", files_added: 1 })),
    ).toBe("Adds a file to a dive you have");
    expect(
      importDiveOutcomeSentence(
        dive({ outcome: "updated", files_added: 2, recordings_added: 1 }),
      ),
    ).toBe("Adds 2 files and another computer's recording to a dive you have");
  });

  it("says why a dive is skipped", () => {
    expect(
      importDiveOutcomeSentence(
        dive({
          outcome: "skipped",
          uuid: null,
          reason: "It has no start time.",
        }),
      ),
    ).toBe("Skipped: It has no start time.");
  });
});

describe("importButtonLabel", () => {
  it("counts the dives created or restored", () => {
    expect(
      importButtonLabel([
        dive(),
        dive({ outcome: "restored" }),
        dive({ outcome: "updated", files_added: 1 }),
        dive({ outcome: "linked" }),
      ]),
    ).toBe("Import 2 dives");
    expect(importButtonLabel([dive()])).toBe("Import 1 dive");
  });

  it("says what updated rows add where nothing is created", () => {
    expect(
      importButtonLabel([
        dive({ outcome: "updated", files_added: 1 }),
        dive({ outcome: "updated", files_added: 1, recordings_added: 1 }),
        dive({ outcome: "linked" }),
      ]),
    ).toBe("Import 2 files and 1 recording");
  });

  it("never claims the negative for linked and skipped rows, or none", () => {
    // A re-read of the same folder, a document of gear alone, a read whose only
    // effect is a recording's filled blanks: each may still write, and whether
    // it does is the writer's fact, which the report does not carry.
    expect(
      importButtonLabel([
        dive({ outcome: "linked" }),
        dive({ outcome: "skipped", uuid: null }),
      ]),
    ).toBe("Import");
    expect(importButtonLabel([])).toBe("Import");
  });
});

describe("importMemberNotKeptSentence", () => {
  it("says why for each reason, and something for one it does not know", () => {
    expect(importMemberNotKeptSentence("several_dives")).toMatch(
      /several dives/,
    );
    expect(importMemberNotKeptSentence("already_stored")).toMatch(
      /already has this file/,
    );
    expect(importMemberNotKeptSentence("a_new_reason")).toBe("Not kept");
  });
});

describe("isHiddenImportPath", () => {
  it("drops dot-files, dot-folders and the macOS shadow tree", () => {
    expect(isHiddenImportPath(".DS_Store")).toBe(true);
    expect(isHiddenImportPath("Suunto/.DS_Store")).toBe(true);
    expect(isHiddenImportPath(".git/config")).toBe(true);
    expect(isHiddenImportPath("__MACOSX/Suunto/._1.fit")).toBe(true);
    expect(isHiddenImportPath("Suunto/1.fit")).toBe(false);
  });
});

describe("the client's refusals", () => {
  const sized = (name: string, megabytes: number, type = "") => ({
    name,
    type,
    size: megabytes * 1024 * 1024,
  });

  it("refuses a file that is not a zip past 100 MB, and a zip past 500 MB", () => {
    expect(importFileRefusal(sized("logbook.divejson", 100))).toBeNull();
    expect(importFileRefusal(sized("logbook.divejson", 101))).toMatch(
      /up to 100 MB/,
    );
    expect(importFileRefusal(sized("backup.zip", 499))).toBeNull();
    expect(importFileRefusal(sized("backup", 501, "application/zip"))).toMatch(
      /zip may be up to 500 MB/,
    );
  });

  it("refuses a selection past 1000 files or 500 MB in all", () => {
    expect(importSelectionRefusal([sized("a", 1)])).toBeNull();
    expect(
      importSelectionRefusal(Array.from({ length: 1001 }, () => sized("a", 0))),
    ).toMatch(/Zip them/);
    expect(importSelectionRefusal([sized("a", 300), sized("b", 201)])).toMatch(
      /in parts/,
    );
  });

  it("tells a zip by its name or its type", () => {
    expect(isZipFile({ name: "Dives.ZIP", type: "" })).toBe(true);
    expect(isZipFile({ name: "export", type: "application/zip" })).toBe(true);
    expect(isZipFile({ name: "1.fit", type: "" })).toBe(false);
  });
});
