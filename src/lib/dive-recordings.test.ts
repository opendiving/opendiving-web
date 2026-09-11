import { describe, expect, it } from "vitest";
import type {
  Dive,
  DiveFileInfo,
  DiveProfileInfo,
  Recording,
} from "@/lib/api/dives";
import {
  canMergeDive,
  diveFileRows,
  diveRecordings,
  noFileKeptSentence,
  primaryRecording,
  recordingDeviceLabel,
  recordingLabel,
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
    duration: 3163,
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
