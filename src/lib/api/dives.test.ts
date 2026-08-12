import { describe, it, expect } from "vitest";
import {
  diveParserLabel,
  DIVE_FILE_ACCEPT,
  DIVE_PARSER_LABELS,
  MAX_DIVE_FILE_SIZE,
} from "./dives";

describe("diveParserLabel", () => {
  it("labels every parser key the API can currently emit", () => {
    // These are `DiveParser.key` values from the API's `dive_parsers` registry.
    // A key with no label here would render as the raw slug.
    expect(diveParserLabel("suunto_xml")).toBe("Suunto XML export");
    expect(diveParserLabel("suunto_json")).toBe("Suunto JSON export");
    // Vendor-neutral: the API's one `fit` parser reads Garmin Descent and
    // Suunto FIT files alike, so the label names neither.
    expect(diveParserLabel("fit")).toBe("FIT export");
  });

  it("falls back to the raw key for a parser this build hasn't heard of", () => {
    // The API can grow a parser ahead of the frontend. "garmin_fit" is worse
    // than a label but far better than a blank cell that looks like a bug.
    expect(diveParserLabel("garmin_fit")).toBe("garmin_fit");
  });

  it("returns null when there is no key at all", () => {
    expect(diveParserLabel(null)).toBeNull();
    expect(diveParserLabel(undefined)).toBeNull();
    expect(diveParserLabel("")).toBeNull();
  });
});

describe("DIVE_FILE_ACCEPT", () => {
  it("offers a file extension for every parser the API registers", () => {
    // Acceptance is decided API-side by each parser's `can_parse` (the FIT one
    // wants a `.fit` name *and* the `.FIT` magic at offset 8). This list only
    // decides what the picker greys out, so a parser the API grows and this
    // list forgets is invisible: the file simply can't be selected.
    //
    // `satisfies` against `DIVE_PARSER_LABELS`' own keys, so adding a parser
    // there stops this file compiling until its extension is offered too. A
    // hand-written `Record<string, string>` looked like it did this and didn't:
    // a fourth parser would have compiled and passed unchanged.
    const extensionsByParser = {
      suunto_xml: ".xml",
      suunto_json: ".json",
      fit: ".fit",
    } satisfies Record<keyof typeof DIVE_PARSER_LABELS, string>;

    const offered = DIVE_FILE_ACCEPT.split(",");
    expect(new Set(offered)).toEqual(
      new Set(Object.values(extensionsByParser)),
    );
  });
});

describe("MAX_DIVE_FILE_SIZE", () => {
  it("matches the API's own limit", () => {
    // Mirrored from `services/dive_files.py::MAX_DIVE_FILE_SIZE`. A larger
    // value here would let the client start an upload the API will reject.
    expect(MAX_DIVE_FILE_SIZE).toBe(5 * 1024 * 1024);
  });
});
