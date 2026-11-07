import { describe, expect, it } from "vitest";
import {
  collectionLabel,
  collectionRowIsEmpty,
  fileRestoreHint,
  importButtonLabel,
  importCountsSentence,
  importFileRefusal,
  importOutcomeLabel,
  importRowHasCard,
  importSelectionRefusal,
  importStartText,
  importSummaryTerms,
  importTotals,
  isHiddenImportPath,
  isZipFile,
  noteGroupPlacesSentence,
  noteKindLabel,
  noteKindTone,
  reviewCollectionRows,
  truncatedDiveNotesSentence,
  truncatedNotesSentence,
} from "./logbook-import";
import type {
  ImportCollectionReport,
  ImportFileReport,
  ImportNoteGroup,
} from "@/lib/api/logbook-import";
import { importDiveRow as dive } from "@/test/dive-fixtures";

function row(
  collection: string,
  counts: Partial<Omit<ImportCollectionReport, "collection">> = {},
): ImportCollectionReport {
  return {
    collection,
    created: 0,
    linked: 0,
    skipped: 0,
    ...counts,
  };
}

function fileReport(
  overrides: Partial<ImportFileReport> = {},
): ImportFileReport {
  return {
    referenced: 0,
    restored: 0,
    not_contained: 0,
    skipped: 0,
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
  it("sums each count across the rows", () => {
    const totals = importTotals([
      row("dives", { created: 4, skipped: 1 }),
      row("sites", { created: 1, linked: 3 }),
    ]);

    expect(totals).toEqual({ created: 5, linked: 3, skipped: 1 });
  });

  it("is all zeroes for no rows", () => {
    expect(importTotals([])).toEqual({ created: 0, linked: 0, skipped: 0 });
  });
});

describe("collectionRowIsEmpty", () => {
  it("is true only when all three counts are zero", () => {
    expect(collectionRowIsEmpty(row("dives"))).toBe(true);
    expect(collectionRowIsEmpty(row("dives", { skipped: 1 }))).toBe(false);
    expect(collectionRowIsEmpty(row("dives", { linked: 1 }))).toBe(false);
  });
});

describe("truncatedNotesSentence", () => {
  it("says nothing when the list is the whole story", () => {
    expect(truncatedNotesSentence(0)).toBeNull();
  });

  it("says how many are missing", () => {
    // Without it a capped list reads as if it were all of them.
    expect(truncatedNotesSentence(112)).toBe(
      "112 further notes are not shown.",
    );
  });

  it("does not say '1 further notes'", () => {
    expect(truncatedNotesSentence(1)).toBe("1 further note is not shown.");
  });
});

describe("fileRestoreHint", () => {
  it("tells a bare document's importer where the bytes are", () => {
    const hint = fileRestoreHint(
      fileReport({ referenced: 3, not_contained: 3 }),
      false,
    );

    expect(hint).toContain("3 files");
    expect(hint).toContain(".zip");
  });

  it("says nothing after an archive import, where the bytes already came", () => {
    expect(
      fileRestoreHint(fileReport({ referenced: 3, restored: 3 }), true),
    ).toBeNull();
  });

  it("says nothing for a document that references no files at all", () => {
    expect(fileRestoreHint(fileReport(), false)).toBeNull();
  });

  it("does not say 'These 1 files'", () => {
    expect(
      fileRestoreHint(fileReport({ referenced: 1, not_contained: 1 }), false),
    ).toContain("This file is");
  });
});

function group(overrides: Partial<ImportNoteGroup> = {}): ImportNoteGroup {
  return {
    code: "value_dropped",
    kind: "dropped",
    collection: "dives",
    message: "Visibility is a star rating here and has no metric equivalent.",
    count: 1,
    wheres: ["dive/0"],
    ...overrides,
  };
}

describe("noteKindLabel", () => {
  it("names each kind the API sends today", () => {
    expect(noteKindLabel("absent")).toBe("Not recorded");
    expect(noteKindLabel("inferred")).toBe("Worked out");
    expect(noteKindLabel("resolved")).toBe("Resolved");
    expect(noteKindLabel("dropped")).toBe("Dropped");
  });

  it("gives a note with no kind no badge", () => {
    expect(noteKindLabel(null)).toBeNull();
  });

  it("de-snakes a kind this build has never heard of", () => {
    // The API sends `kind` as an opaque string deliberately: the readers' kind
    // set grew from three to four once, and the pin deciding which set a build
    // sees moves with no change here. A blank badge would be worse than the raw
    // word.
    expect(noteKindLabel("partially_carried")).toBe("Partially carried");
  });
});

describe("noteKindTone", () => {
  it("is a warning only where the diver ends up with less", () => {
    expect(noteKindTone("dropped")).toBe("warning");
  });

  it("keeps the import's working plain, and an absence quietest", () => {
    // `inferred` and `resolved` explain rather than report a loss, and a note
    // with no kind is a decision such as a linked record or a file a bare
    // document does not carry - the import working as designed. `absent` is a
    // property of the file: it never recorded the thing at all.
    expect(noteKindTone("inferred")).toBe("neutral");
    expect(noteKindTone("resolved")).toBe("neutral");
    expect(noteKindTone(null)).toBe("neutral");
    expect(noteKindTone("absent")).toBe("muted");
  });

  it("reads a kind from a newer API as information, not alarm", () => {
    // Reachable without anyone touching this repository - which is the whole
    // reason it is here.
    expect(noteKindTone("stretched")).toBe("neutral");
  });
});

describe("noteGroupPlacesSentence", () => {
  it("says how many places raised it, and where three of them were", () => {
    expect(
      noteGroupPlacesSentence(
        group({ count: 15, wheres: ["dive/0", "dive/1", "dive/2"] }),
      ),
    ).toBe("15 places — dive/0, dive/1, dive/2 and 12 more");
  });

  it("does not claim more when it listed all of them", () => {
    expect(
      noteGroupPlacesSentence(
        group({ count: 2, wheres: ["dive/0", "dive/3"] }),
      ),
    ).toBe("2 places — dive/0, dive/3");
  });

  it("does not say '1 places'", () => {
    expect(noteGroupPlacesSentence(group({ count: 1 }))).toBe(
      "1 place — dive/0",
    );
  });

  it("counts the import's own notes, which name no place", () => {
    expect(
      noteGroupPlacesSentence(
        group({ code: "record_linked", kind: null, count: 4, wheres: [] }),
      ),
    ).toBe("4 times");
  });

  it("says nothing of a note that came up once and names no place", () => {
    expect(noteGroupPlacesSentence(group({ count: 1, wheres: [] }))).toBeNull();
  });
});

describe("truncatedDiveNotesSentence", () => {
  it("says nothing when the row lists every note", () => {
    expect(truncatedDiveNotesSentence(0)).toBeNull();
  });

  it("says how many of the dive's notes are missing, and where they went", () => {
    expect(truncatedDiveNotesSentence(1)).toBe(
      "1 further note about this dive is listed with the import's notes below.",
    );
    expect(truncatedDiveNotesSentence(3)).toBe(
      "3 further notes about this dive are listed with the import's notes below.",
    );
  });
});

describe("reviewCollectionRows", () => {
  const collections = [
    row("dives", { created: 23, skipped: 24 }),
    row("sites", { linked: 1 }),
    row("trips"),
  ];

  it("leaves the dives row to the dive rows wherever there are any", () => {
    // `collections` counts a pair's second file as a skipped dive; its row says
    // "new". Showing both is "Skipped 24" under 23 new dives.
    expect(
      reviewCollectionRows({ collections, dives: [dive()] }).map(
        (r) => r.collection,
      ),
    ).toEqual(["sites"]);
  });

  it("keeps the dives row where there are no dive rows to report them", () => {
    expect(
      reviewCollectionRows({ collections, dives: [] }).map((r) => r.collection),
    ).toEqual(["dives", "sites"]);
  });

  it("is empty when nothing but dives counts", () => {
    expect(
      reviewCollectionRows({
        collections: [row("dives", { created: 2 })],
        dives: [dive()],
      }),
    ).toEqual([]);
  });
});

describe("importOutcomeLabel", () => {
  it("says each outcome in the diver's terms", () => {
    expect(importOutcomeLabel("new")).toBe("New");
    expect(importOutcomeLabel("modified")).toBe("Modified");
    expect(importOutcomeLabel("unchanged")).toBe("Unchanged");
    expect(importOutcomeLabel("skipped")).toBe("Skipped");
  });
});

describe("importStartText", () => {
  it("shows the wall clock with its offset, and nothing nothing recorded", () => {
    expect(importStartText("2026-09-07T11:04:58+03:00")).toMatch(/\+03:00$/);
    expect(importStartText("2026-09-07T11:04:58")).not.toMatch(/[+-]\d\d:\d\d/);
    expect(importStartText("2026-09-07")).not.toMatch(/:/);
    expect(importStartText(null)).toBe("—");
  });
});

describe("importRowHasCard", () => {
  it("is true for a new or modified row that carries its dive", () => {
    expect(importRowHasCard(dive())).toBe(true);
    expect(importRowHasCard(dive({ outcome: "modified" }))).toBe(true);
    expect(importRowHasCard(dive({ dive: null }))).toBe(false);
    expect(importRowHasCard(dive({ outcome: "unchanged" }))).toBe(false);
    // A row the apply skipped keeps the dive the review showed.
    expect(importRowHasCard(dive({ outcome: "skipped" }))).toBe(false);
  });
});

describe("importSummaryTerms", () => {
  const texts = (...outcomes: Parameters<typeof dive>[0][]) =>
    importSummaryTerms(outcomes.map((row) => dive(row))).map(
      (term) => term.text,
    );

  it("counts the rows by outcome, the first term naming what is counted", () => {
    expect(
      texts(
        {},
        {},
        { outcome: "modified" },
        { outcome: "unchanged" },
        { outcome: "skipped" },
      ),
    ).toEqual(["2 new dives", "1 modified", "1 unchanged", "1 skipped"]);
  });

  it("leaves out the zero terms, and is singular for one", () => {
    expect(texts({ outcome: "unchanged" })).toEqual(["1 unchanged dive"]);
    expect(importSummaryTerms([])).toEqual([]);
  });
});

describe("importCountsSentence", () => {
  it("says a history row's counts", () => {
    expect(importCountsSentence({ new: 12, modified: 2 })).toBe(
      "12 new, 2 modified",
    );
    expect(importCountsSentence({ unchanged: 5, skipped: 1 })).toBe(
      "5 unchanged, 1 skipped",
    );
  });

  it("says something for an import of no dives", () => {
    expect(importCountsSentence({})).toBe("No dives");
  });
});

describe("importButtonLabel", () => {
  it("counts the new and modified rows", () => {
    expect(
      importButtonLabel([
        dive(),
        dive({ outcome: "modified" }),
        dive({ outcome: "unchanged" }),
        dive({ outcome: "skipped" }),
      ]),
    ).toBe("Import 2 dives");
    expect(importButtonLabel([dive()])).toBe("Import 1 dive");
  });

  it("never claims the negative where no dive is written", () => {
    // A check-in detail or a tag may still be written.
    expect(
      importButtonLabel([
        dive({ outcome: "unchanged" }),
        dive({ outcome: "skipped", uuid: null }),
      ]),
    ).toBe("Import");
    expect(importButtonLabel([])).toBe("Import");
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
