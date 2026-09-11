import { describe, expect, it } from "vitest";
import {
  collectionLabel,
  collectionRowIsEmpty,
  conversionKindLabel,
  conversionKindTone,
  conversionWhereSentence,
  fileRestoreHint,
  importSourceSentence,
  importTotals,
  noteIsWarning,
  truncatedConversionSentence,
  truncatedNotesSentence,
} from "./logbook-import";
import type {
  ConversionNoteGroup,
  ImportCollectionReport,
  ImportPreview,
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
    // Null by default: the ordinary upload is a DiveJSON document the API read
    // as-is, and the conversion block exists only when something was converted.
    conversion: null,
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
        // The two recording outcomes. A file that matched a dive already in the
        // account was attached to it rather than creating a second one, and a
        // file that matched an existing recording filled that recording's
        // blanks - in both cases the alternative was a duplicate, so the note
        // is reporting the import working, not falling short.
        "recording_attached",
        "recording_filled",
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

describe("importSourceSentence", () => {
  function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
    return {
      ...report(),
      format: "divejson",
      version: "1.0",
      generator: { name: "OpenDiving", version: "0.4.0" },
      archive: false,
      token: "tok-1",
      ...overrides,
    };
  }

  it("names the diver's own file, not the document the API ended up reading", () => {
    // The load-bearing case. `format`, `version` and `generator` all describe
    // the converter's output on this path, so a header built from them tells a
    // diver who uploaded a Subsurface save file that they uploaded DiveJSON.
    expect(
      importSourceSentence(
        preview({
          generator: { name: "divejson convert", version: "0.3.0" },
          conversion: {
            format: "ssrf",
            converter: { name: "divejson", version: "0.3.0" },
            groups: [],
            groups_truncated: 0,
          },
        }),
      ),
    ).toBe(
      "Subsurface file, converted to DiveJSON 1.0 by divejson convert 0.3.0.",
    );
  });

  it("names an unrecognised format by its id rather than rendering a blank", () => {
    // A reader the API's converter gained after this build was cut. The
    // sentence gets terser, never wrong - and never `undefined file`.
    //
    // A made-up id rather than a real upcoming one. This case used to name
    // `suunto_xml`, which then shipped a label and turned a test of the
    // fallback into a test of the lookup beside it - so the id here is one
    // nothing will ever claim.
    expect(
      importSourceSentence(
        preview({
          generator: null,
          conversion: {
            format: "kraken_binary",
            converter: { name: "divejson", version: "0.4.0" },
            groups: [],
            groups_truncated: 0,
          },
        }),
      ),
    ).toBe("kraken_binary file, converted to DiveJSON 1.0 by divejson 0.4.0.");
  });

  it("describes a native document as the document it is", () => {
    expect(importSourceSentence(preview())).toBe(
      "Document in divejson 1.0, written by OpenDiving 0.4.0.",
    );
  });

  it("describes the full archive as an archive", () => {
    expect(importSourceSentence(preview({ archive: true }))).toBe(
      "Archive in divejson 1.0, written by OpenDiving 0.4.0.",
    );
  });

  it("says nothing about a generator a document did not declare", () => {
    expect(importSourceSentence(preview({ generator: null }))).toBe(
      "Document in divejson 1.0.",
    );
  });
});
