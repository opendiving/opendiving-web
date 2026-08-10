import { describe, it, expect } from "vitest";
import { diveParserLabel, MAX_DIVE_FILE_SIZE } from "./dives";

describe("diveParserLabel", () => {
  it("labels every parser key the API can currently emit", () => {
    // These are `DiveParser.key` values from the API's `dive_parsers` registry.
    // A key with no label here would render as the raw slug.
    expect(diveParserLabel("suunto_xml")).toBe("Suunto XML export");
    expect(diveParserLabel("suunto_json")).toBe("Suunto JSON export");
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

describe("MAX_DIVE_FILE_SIZE", () => {
  it("matches the API's own limit", () => {
    // Mirrored from `services/dive_files.py::MAX_DIVE_FILE_SIZE`. A larger
    // value here would let the client start an upload the API will reject.
    expect(MAX_DIVE_FILE_SIZE).toBe(5 * 1024 * 1024);
  });
});
