import { describe, expect, it } from "vitest";
import type {
  Dive,
  DiveFileInfo,
  DiveProfileInfo,
  Recording,
} from "@/lib/api/dives";
import {
  canMergeDive,
  deleteFileConfirmation,
  deleteRecordingConfirmation,
  diveFileRows,
  diveRecordings,
  noFileKeptSentence,
  primaryRecording,
  recordingDeviceLabel,
  recordingLabel,
  recordingReadoutsLabel,
  recordingSettingsLabel,
  UNNAMED_DEVICE_LABEL,
} from "@/lib/dive-recordings";

function file(overrides: Partial<DiveFileInfo> = {}): DiveFileInfo {
  return {
    uuid: "f1",
    original_filename: "dive.fit",
    content_type: "application/octet-stream",
    byte_size: 4096,
    parser_key: "fit",
    ...overrides,
  };
}

function recording(overrides: Partial<Recording> = {}): Recording {
  return { uuid: "r1", ordinal: 0, files: [], ...overrides };
}

function profileInfo(
  overrides: Partial<DiveProfileInfo> = {},
): DiveProfileInfo {
  return {
    uuid: "p1",
    // Milliseconds, the profile's own axis.
    duration: 3_163_000,
    depth_sample_count: 314,
    provenance: "file",
    channels: ["depth"],
    ...overrides,
  };
}

function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "d1",
    dive_number: 1,
    start_time: "2026-09-08T15:18:10",
    duration: 3163,
    dive_sites: [],
    gear_items: [],
    notes: "",
    user_uuid: "u1",
    created_at: "2026-09-08T13:18:10Z",
    mixtures: [],
    ...overrides,
  };
}

describe("recordingDeviceLabel", () => {
  it("puts the brand and model first, then the serial", () => {
    // The Shearwater UDDF's device, verbatim. `name` is `Perdix 3` here too and
    // is deliberately not repeated in parentheses.
    expect(
      recordingDeviceLabel({
        brand: "Shearwater Research, Inc",
        model: "Perdix 3",
        serial: "D9772626",
        name: "Perdix 3",
      }),
    ).toBe("Shearwater Research, Inc Perdix 3 · D9772626");
  });

  it("names the computer its owner named, where that is not the model", () => {
    // The Suunto app's JSON: a brand, a serial, a name the diver set, and no
    // model at all.
    expect(
      recordingDeviceLabel({
        brand: "Suunto",
        serial: "253810000400",
        name: "Porvoo",
        firmware: "2.51.28",
      }),
    ).toBe("Suunto · 253810000400 (Porvoo)");
  });

  it("does not say the brand twice when the model already carries it", () => {
    // A FIT decodes its maker to the lowercase `suunto` beside the model
    // `Suunto Ocean`, and the API stores both exactly as the file wrote them.
    // The naive join reads "suunto Suunto Ocean".
    expect(
      recordingDeviceLabel({ brand: "suunto", model: "Suunto Ocean" }),
    ).toBe("Suunto Ocean");
  });

  it("has nothing to say about a device that only records its firmware", () => {
    // Not a broken row - a format may carry a version string and no identity -
    // so the caller substitutes a word rather than rendering a blank.
    expect(recordingDeviceLabel({ firmware: "2.51.28" })).toBeNull();
    expect(recordingDeviceLabel(null)).toBeNull();
    expect(recordingDeviceLabel(undefined)).toBeNull();
  });

  it("treats a blank member as absent rather than as a value", () => {
    // A format that writes an empty element rather than omitting it. Joining on
    // truthiness alone would render " · D9772626" with a leading separator.
    expect(recordingDeviceLabel({ brand: "  ", serial: "D9772626" })).toBe(
      "D9772626",
    );
  });
});

describe("diveRecordings", () => {
  it("orders by ordinal rather than trusting the response", () => {
    const ordered = diveRecordings(
      dive({
        recordings: [
          recording({ uuid: "second", ordinal: 1 }),
          recording({ uuid: "first", ordinal: 0 }),
        ],
      }),
    );

    expect(ordered.map((item) => item.uuid)).toEqual(["first", "second"]);
  });

  it("reads an absent list as empty", () => {
    // `recordings` is absent - not `[]` - on a list row and on any detail
    // payload the API cached before recordings existed.
    expect(diveRecordings(dive())).toEqual([]);
    expect(primaryRecording(dive())).toBeNull();
  });

  it("finds the primary wherever the response put it", () => {
    expect(
      primaryRecording(
        dive({
          recordings: [
            recording({ uuid: "second", ordinal: 1 }),
            recording({ uuid: "first", ordinal: 0 }),
          ],
        }),
      )?.uuid,
    ).toBe("first");
  });
});

describe("noFileKeptSentence", () => {
  it("says nothing about a recording that kept a file", () => {
    expect(noFileKeptSentence(recording({ files: [file()] }))).toBeNull();
  });

  it("names the converter for a recording logbook import built from a document", () => {
    expect(
      noFileKeptSentence(
        recording({ profile: profileInfo({ provenance: "divejson_import" }) }),
      ),
    ).toBe("No file kept — these samples were imported through the converter.");
  });

  it("names the merge for a recording two others were folded into", () => {
    // The distinction the recording's own shape cannot make: a merge keeps
    // whatever files either half had, so an empty `files` says only that
    // neither half had one.
    expect(
      noFileKeptSentence(
        recording({ profile: profileInfo({ provenance: "merge" }) }),
      ),
    ).toBe("No file kept — these samples were merged from two recordings.");
  });

  it("claims nothing about samples for a recording that carries none", () => {
    // A device and nothing else - what logbook import writes for a document
    // whose recording had no profile and no files. The two sentences above
    // would both be false here.
    const sentence = noFileKeptSentence(recording());
    expect(sentence).toMatch(/no file kept/i);
    expect(sentence).not.toMatch(/samples/i);
  });
});

describe("diveFileRows", () => {
  it("gives every file a row and every file-less recording one of its own", () => {
    const rows = diveFileRows([
      recording({
        uuid: "perdix",
        ordinal: 0,
        device: { model: "Perdix 3", serial: "D9772626" },
      }),
      recording({
        uuid: "ocean",
        ordinal: 1,
        device: { brand: "Suunto", serial: "253810000400" },
        files: [
          file({
            uuid: "json",
            original_filename: "dive.json",
            parser_key: "suunto_json",
          }),
          file({ uuid: "fit", original_filename: "dive.fit" }),
        ],
      }),
    ]);

    expect(rows.map((row) => row.kind)).toEqual(["empty", "file", "file"]);
    expect(rows.map((row) => row.key)).toEqual([
      "recording:perdix",
      "file:json",
      "file:fit",
    ]);
  });

  it("carries the device onto every one of a recording's rows", () => {
    const rows = diveFileRows([
      recording({
        device: { brand: "Suunto", model: "Suunto Ocean" },
        files: [file({ uuid: "a" }), file({ uuid: "b" })],
      }),
    ]);

    expect(rows.map((row) => row.deviceLabel)).toEqual([
      "Suunto Ocean",
      "Suunto Ocean",
    ]);
  });

  it("names which recording a row belongs to only when there are several", () => {
    // On a single-recording dive every row belongs to the same device, and a
    // per-row "Recording 1" is noise.
    const alone = diveFileRows([recording({ files: [file()] })]);
    expect(alone[0].recordingName).toBeNull();

    const several = diveFileRows([
      recording({ uuid: "a", ordinal: 0, files: [file({ uuid: "a1" })] }),
      recording({ uuid: "b", ordinal: 1, files: [file({ uuid: "b1" })] }),
    ]);
    expect(several.map((row) => row.recordingName)).toEqual([
      "Recording 1",
      "Recording 2",
    ]);
  });

  it("resolves the parser's label rather than handing on the raw key", () => {
    const [row] = diveFileRows([
      recording({ files: [file({ parser_key: "suunto_json" })] }),
    ]);

    expect(row.kind === "file" && row.parserLabel).toBe("Suunto JSON export");
  });

  it("falls back to a word for a recording whose source named no computer", () => {
    // Asserted here as well as in `recordingDeviceLabel` because this is the
    // value the rows actually carry: `null`, for the component to substitute.
    const [row] = diveFileRows([recording({ files: [file()] })]);
    expect(row.deviceLabel).toBeNull();
    expect(UNNAMED_DEVICE_LABEL).toBe("Dive computer");
  });
});

describe("recordingLabel", () => {
  it("counts from one, because ordinals are the API's and not the diver's", () => {
    expect(recordingLabel(recording({ ordinal: 0 }))).toBe("Recording 1");
    expect(recordingLabel(recording({ ordinal: 1 }))).toBe("Recording 2");
  });
});

describe("canMergeDive", () => {
  it("offers nothing on a dive logged by hand", () => {
    // The API refuses to merge a hand-entered dive, so an action offered here
    // could only ever 422.
    expect(canMergeDive(dive())).toBe(false);
  });

  it("offers the action as soon as a computer recorded the dive", () => {
    expect(canMergeDive(dive({ recordings: [recording()] }))).toBe(true);
  });
});

// The Suunto that exported one dive twice, plus a second computer beside it -
// the shape the understated copy was found on. `suunto` holds a JSON and a FIT
// and is shown by default; `perdix` is the one that takes over when it goes.
const suuntoJson = file({ uuid: "sj", original_filename: "dive.json" });
const suuntoFit = file({ uuid: "sf", original_filename: "dive.fit" });
const perdixFile = file({ uuid: "pf", original_filename: "perdix.uddf" });

describe("deleteFileConfirmation", () => {
  it("keeps the plain title while the recording keeps other files", () => {
    const suunto = recording({ files: [suuntoJson, suuntoFit] });
    const { title, description } = deleteFileConfirmation([suunto], "sf");

    expect(title).toBe("Delete this file?");
    expect(description).toContain("profile and readouts are re-read");
    // The one recording there is writes the dive's positions, so they move with
    // it even though the recording itself survives.
    expect(description).toContain("re-read along with it");
  });

  it("says the positions are left alone for a recording that does not write them", () => {
    // The Perdix's last file, so its recording goes - its own readouts with it -
    // but it is not the one shown by default, and the dive's positions are the
    // Suunto's either way.
    const suunto = recording({ files: [suuntoJson, suuntoFit] });
    const perdix = recording({ uuid: "r2", ordinal: 1, files: [perdixFile] });
    const { title, description } = deleteFileConfirmation(
      [suunto, perdix],
      "pf",
    );

    expect(title).toBe("Delete this file and its recording?");
    expect(description).toContain("the whole recording goes with it");
    expect(description).toContain("its readouts");
    expect(description).toContain("are left alone");
  });

  it("says the recording goes, and which one takes over, on the last file", () => {
    // The reported case exactly: the Suunto's FIT is already gone, deleting its
    // JSON takes the recording, and the Perdix becomes the charted profile.
    const suunto = recording({ files: [suuntoJson] });
    const perdix = recording({ uuid: "r2", ordinal: 1, files: [perdixFile] });
    const { title, description } = deleteFileConfirmation(
      [suunto, perdix],
      "sj",
    );

    expect(title).toBe("Delete this file and its recording?");
    expect(description).toContain("the whole recording goes with it");
    expect(description).toContain("the next one takes over");
    expect(description).toContain("re-read from that instead");
    expect(description).toContain("The dive itself stays");
  });

  it("does not promise a handover to a recording with no file to read", () => {
    // `renumber_ordinals` promotes in ordinal order without skipping a file-less
    // recording, and `refresh_tech_scalars` then finds nothing on it - so the
    // positions are cleared exactly as if no recording were left, and the
    // reassuring sentence would be the one lie this whole change exists to stop.
    const suunto = recording({ files: [suuntoJson] });
    const imported = recording({
      uuid: "r2",
      ordinal: 1,
      files: [],
      profile: profileInfo({ provenance: "divejson_import" }),
    });
    const { title, description } = deleteFileConfirmation(
      [suunto, imported],
      "sj",
    );

    expect(title).toBe("Delete this file and its recording?");
    expect(description).toContain("the next one takes over");
    expect(description).toContain("it holds no file");
    expect(description).toContain("are cleared");
    expect(description).not.toContain("re-read from that instead");
  });

  it("finds the recording that takes over by ordinal, not by list position", () => {
    // The edit form passes `dive.recordings` straight through, unsorted, so the
    // successor is not simply the next entry in the array.
    const suunto = recording({ files: [suuntoJson] });
    const third = recording({ uuid: "r3", ordinal: 2, files: [] });
    const second = recording({ uuid: "r2", ordinal: 1, files: [perdixFile] });
    const { description } = deleteFileConfirmation(
      [third, suunto, second],
      "sj",
    );

    expect(description).toContain("re-read from that instead");
  });

  it("says the positions are cleared when nothing is left to read them from", () => {
    const suunto = recording({ files: [suuntoJson] });
    const { title, description } = deleteFileConfirmation([suunto], "sj");

    expect(title).toBe("Delete this file and its recording?");
    expect(description).toContain("the dive's only recording");
    expect(description).toContain("nothing is left to read them from");
    expect(description).not.toContain("takes over");
  });

  it.each([
    ["merge", "they were merged from two recordings"],
    ["divejson_import", "they came in through the converter"],
  ] as const)(
    "keeps a recording whose %s samples no file could produce again",
    (provenance, clause) => {
      const merged = recording({
        files: [suuntoJson],
        profile: profileInfo({ provenance }),
      });
      const { title, description } = deleteFileConfirmation([merged], "sj");

      // The recording survives file-less, so the title must not promise its
      // removal, and its readouts stay with it - but the dive's positions still
      // go, having come off the file.
      expect(title).toBe("Delete this file?");
      expect(description).toContain("nothing to download");
      expect(description).toContain(clause);
      expect(description).toContain("Its samples and readouts stay");
      expect(description).toContain("are cleared with the last of those files");
    },
  );

  it("removes a recording whose samples were read off the file", () => {
    const suunto = recording({
      files: [suuntoJson],
      profile: profileInfo({ provenance: "file" }),
    });

    expect(deleteFileConfirmation([suunto], "sj").title).toBe(
      "Delete this file and its recording?",
    );
  });

  it("still calls a secondary deletion a no-op when the primary holds no file", () => {
    // A converted logbook import writes its document's positions onto the dive
    // beside a file-less primary, and `refresh_tech_scalars` re-reading that
    // primary - finding nothing - would clear them on a deletion that never
    // touched it. It takes a `touched_primary` and returns without writing, so
    // this is the no-op it looks like and the copy says so.
    const imported = recording({
      files: [],
      profile: profileInfo({ provenance: "divejson_import" }),
    });
    const perdix = recording({ uuid: "r2", ordinal: 1, files: [perdixFile] });
    const { description } = deleteFileConfirmation([imported, perdix], "pf");

    expect(description).toContain("are left alone");
  });

  it("calls a secondary deletion a no-op while the primary still has files", () => {
    const suunto = recording({ files: [suuntoJson] });
    const perdix = recording({ uuid: "r2", ordinal: 1, files: [perdixFile] });

    expect(
      deleteFileConfirmation([suunto, perdix], "pf").description,
    ).toContain("are left alone");
  });

  it("leaves the positions alone when a secondary merely loses one of its files", () => {
    // The same answer by a second route: `_rederive_recording` re-reads that
    // recording's own readouts and returns before the dive's positions for any
    // recording that is not ordinal 0.
    const imported = recording({
      files: [],
      profile: profileInfo({ provenance: "divejson_import" }),
    });
    const perdix = recording({
      uuid: "r2",
      ordinal: 1,
      files: [perdixFile, file({ uuid: "pf2", original_filename: "b.fit" })],
    });

    expect(
      deleteFileConfirmation([imported, perdix], "pf").description,
    ).toContain("are left alone");
  });

  it("falls back to a conservative sentence for a file nothing holds", () => {
    // The dialog can outlive a re-read that removed the row behind it. Claiming
    // the recording survives would be the wrong guess of the two.
    const { title, description } = deleteFileConfirmation([], "gone");

    expect(title).toBe("Delete this file?");
    expect(description).toContain("may change with it");
  });
});

describe("deleteRecordingConfirmation", () => {
  it("names what takes over from the recording shown by default", () => {
    const imported = recording({
      files: [],
      profile: profileInfo({ provenance: "divejson_import" }),
    });
    const perdix = recording({ uuid: "r2", ordinal: 1, files: [perdixFile] });
    const { title, description } = deleteRecordingConfirmation(
      [imported, perdix],
      "r1",
    );

    expect(title).toBe("Delete this recording?");
    expect(description).toContain("the next one takes over");
    expect(description).toContain("The dive itself stays");
  });

  it("says the positions are cleared when it was the dive's only recording", () => {
    const imported = recording({
      files: [],
      profile: profileInfo({ provenance: "merge" }),
    });

    // Nothing here ever had a file to read them off, so the sentence must not
    // claim one - this recording's samples came in through a document.
    expect(deleteRecordingConfirmation([imported], "r1").description).toContain(
      "the dive's only recording",
    );
  });

  it("leaves the positions alone for a recording that is not the one shown by default", () => {
    // The whole-recording route's half of the API's `touched_primary`: removing
    // a second computer's recording says nothing about positions the primary -
    // or a document - put on the dive.
    const imported = recording({
      files: [],
      profile: profileInfo({ provenance: "divejson_import" }),
    });
    const perdix = recording({ uuid: "r2", ordinal: 1, files: [perdixFile] });

    expect(
      deleteRecordingConfirmation([imported, perdix], "r2").description,
    ).toContain("are left alone");
  });

  it("covers the files a recording holds rather than assuming it holds none", () => {
    // The dive page offers this route only for a file-less recording, which is a
    // fact about that button and not about the endpoint.
    const suunto = recording({ files: [suuntoJson, suuntoFit] });

    expect(deleteRecordingConfirmation([suunto], "r1").description).toContain(
      "every file it holds",
    );
  });

  it("falls back to a conservative sentence for a recording nothing holds", () => {
    expect(deleteRecordingConfirmation([], "gone").description).toContain(
      "may change with it",
    );
  });
});

describe("recordingSettingsLabel", () => {
  it("says the mode and the model on one line", () => {
    expect(
      recordingSettingsLabel(
        recording({
          mode: "open_circuit",
          deco_model: { algorithm: "buhlmann", gf_low: 30, gf_high: 85 },
        }),
      ),
    ).toBe("Open circuit · Bühlmann GF 30/85");
  });

  it("prefers the device's own name for its model over the family", () => {
    // The same call `recordingDeviceLabel` makes between a model and a brand:
    // "Suunto Fused RGBM 2" says more than "RGBM", and the two together say one
    // of them twice.
    expect(
      recordingSettingsLabel(
        recording({
          mode: "open_circuit",
          deco_model: { algorithm: "rgbm", name: "Suunto Fused RGBM 2" },
        }),
      ),
    ).toBe("Open circuit · Suunto Fused RGBM 2");
  });

  it("names a freedive with no model to name", () => {
    expect(recordingSettingsLabel(recording({ mode: "freedive" }))).toBe(
      "Freedive",
    );
  });

  it("says the model alone where the file recorded no mode", () => {
    expect(
      recordingSettingsLabel(
        recording({ deco_model: { name: "ZHL-16C", gf_low: 40, gf_high: 85 } }),
      ),
    ).toBe("ZHL-16C GF 40/85");
  });

  it("says nothing at all rather than guessing open circuit", () => {
    // UDDF documents an absent `<divemode>` as meaning open circuit. That is the
    // source format's claim about its own default rather than the device's about
    // the dive, and reading it would label a CCR dive whose importer never set
    // the mode as open circuit.
    expect(recordingSettingsLabel(recording())).toBeNull();
    expect(recordingSettingsLabel(recording({ mode: null }))).toBeNull();
    expect(
      recordingSettingsLabel(recording({ mode: null, deco_model: null })),
    ).toBeNull();
  });

  it("says nothing for a mode this build has never heard of", () => {
    // The vocabulary is closed in the API's *current* build, and the two repos
    // deploy independently - so a raw `semi_closed_rebreather` on screen is the
    // failure this guards against, and a wrong word is worse than no word.
    expect(
      recordingSettingsLabel(
        recording({ mode: "semi_closed_rebreather", deco_model: null }),
      ),
    ).toBeNull();
    // Which does not silence what the file *did* record.
    expect(
      recordingSettingsLabel(
        recording({
          mode: "semi_closed_rebreather",
          deco_model: { name: "VPM-B" },
        }),
      ),
    ).toBe("VPM-B");
  });

  it("carries a conservatism as its own clause, sign and all", () => {
    // On the device's own scale - Suunto's P-2 to P2 - which means nothing
    // without the model and the computer beside it, and this line sits under
    // both. `0` is a setting rather than an absence.
    expect(
      recordingSettingsLabel(
        recording({
          mode: "gauge",
          deco_model: { name: "Suunto Fused RGBM 2", conservatism: 0 },
        }),
      ),
    ).toBe("Gauge · Suunto Fused RGBM 2 · conservatism 0");
    expect(
      recordingSettingsLabel(
        recording({ deco_model: { name: "Fused RGBM", conservatism: 1 } }),
      ),
    ).toBe("Fused RGBM · conservatism +1");
    expect(
      recordingSettingsLabel(
        recording({ deco_model: { name: "Fused RGBM", conservatism: -2 } }),
      ),
    ).toBe("Fused RGBM · conservatism -2");
  });

  it("drops a half-recorded gradient-factor pair rather than printing one", () => {
    // The API records both or neither, and a lone "GF 30/" would be a claim the
    // file never made.
    expect(
      recordingSettingsLabel(
        recording({
          mode: "closed_circuit",
          deco_model: { algorithm: "buhlmann", gf_low: 30 },
        }),
      ),
    ).toBe("Closed circuit · Bühlmann");
  });

  it("is null for a deco model that recorded nothing worth a word", () => {
    expect(recordingSettingsLabel(recording({ deco_model: {} }))).toBeNull();
  });

  it("names the salinity the way the computer's own menu does", () => {
    expect(
      recordingSettingsLabel(
        recording({
          mode: "open_circuit",
          deco_model: { algorithm: "buhlmann", gf_low: 30, gf_high: 85 },
          salinity: "en13319",
        }),
      ),
    ).toBe("Open circuit · Bühlmann GF 30/85 · salinity EN13319");
    expect(recordingSettingsLabel(recording({ salinity: "fresh" }))).toBe(
      "salinity Fresh",
    );
    expect(recordingSettingsLabel(recording({ salinity: "salt" }))).toBe(
      "salinity Salt",
    );
  });

  it("says nothing for a salinity this build has never heard of", () => {
    // On `mode`'s terms: the vocabulary may grow in the API before this bundle
    // ships a word for it, and a raw slug is worse than silence.
    expect(
      recordingSettingsLabel(recording({ salinity: "custom" })),
    ).toBeNull();
    expect(recordingSettingsLabel(recording({ salinity: null }))).toBeNull();
  });
});

describe("recordingReadoutsLabel", () => {
  it("says every readout the recording carries on one line", () => {
    expect(
      recordingReadoutsLabel(
        recording({
          cns_start: 0,
          cns_end: 9,
          otu_start: 0,
          otu_end: 22,
          surface_pressure_bar: 1.012,
        }),
      ),
    ).toBe("CNS 0% → 9% · OTU 0 → 22 · Surface pressure 1.012 bar");
  });

  it("keeps a half-recorded pair a pair", () => {
    // A FIT file records an end-OTU and no start - the exposure card's em dash,
    // so the arrow still reads "from, to".
    expect(recordingReadoutsLabel(recording({ otu_end: 23 }))).toBe(
      "OTU — → 23",
    );
  });

  it("says a surface pressure alone, which a recording may carry by itself", () => {
    expect(
      recordingReadoutsLabel(recording({ surface_pressure_bar: 1.009 })),
    ).toBe("Surface pressure 1.009 bar");
  });

  it("treats a recorded zero as a reading", () => {
    expect(recordingReadoutsLabel(recording({ cns_start: 0 }))).toBe(
      "CNS 0% → —",
    );
  });

  it("is null for a recording that reported none, nulls or absent keys", () => {
    expect(recordingReadoutsLabel(recording())).toBeNull();
    expect(
      recordingReadoutsLabel(
        recording({
          cns_start: null,
          cns_end: null,
          otu_start: null,
          otu_end: null,
          surface_pressure_bar: null,
        }),
      ),
    ).toBeNull();
  });
});
