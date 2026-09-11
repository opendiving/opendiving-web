import { describe, expect, it } from "vitest";
import {
  importSourceLabel,
  LOGBOOK_IMPORT_ACCEPT,
  LOGBOOK_IMPORT_SOURCE_EXTENSIONS,
  MAX_IMPORT_ARCHIVE_SIZE,
  MAX_IMPORT_DOCUMENT_SIZE,
  type ImportSourceFormat,
} from "./logbook-import";

describe("LOGBOOK_IMPORT_ACCEPT", () => {
  it("offers a file extension for every format the API converts", () => {
    // The pin `DIVE_FILE_ACCEPT` gets in `dives.test.ts`, for the other import
    // surface: an independent literal, `satisfies` against the union, so a
    // format added to `ImportSourceFormat` and left out of one of the two maps
    // stops this file compiling rather than quietly disappearing from the file
    // dialog. A hand-written `Record<string, ...>` on either side would look
    // like it did this and would not - a fifth format would compile and pass.
    //
    // Acceptance itself is decided API-side by sniffing the bytes; this list
    // only decides what the picker greys out.
    const extensionsByFormat = {
      uddf: [".uddf"],
      ssrf: [".ssrf"],
      fit: [".fit"],
      suunto_json: [".json"],
      suunto_xml: [".xml"],
    } satisfies Record<ImportSourceFormat, readonly string[]>;

    expect(LOGBOOK_IMPORT_SOURCE_EXTENSIONS).toEqual(extensionsByFormat);

    const offered = new Set(LOGBOOK_IMPORT_ACCEPT.split(","));
    for (const extension of Object.values(extensionsByFormat).flat()) {
      expect(offered).toContain(extension);
    }
  });

  it("still offers the app's own two, in both spellings", () => {
    // The native pair is not a converted format and has no entry in the map
    // above, so nothing but this assertion keeps them in the list. A browser
    // that knows neither extension sends `application/octet-stream` for the
    // document, which is why both spellings are there.
    const offered = new Set(LOGBOOK_IMPORT_ACCEPT.split(","));
    expect(offered).toContain(".divejson");
    expect(offered).toContain(".zip");
    expect(offered).toContain("application/vnd.dive+json");
    expect(offered).toContain("application/zip");
  });
});

describe("importSourceLabel", () => {
  it("names every format this build knows the API converts", () => {
    expect(importSourceLabel("uddf")).toBe("UDDF");
    expect(importSourceLabel("ssrf")).toBe("Subsurface");
    expect(importSourceLabel("fit")).toBe("FIT");
    expect(importSourceLabel("suunto_xml")).toBe("Suunto DM5 XML");
    expect(importSourceLabel("suunto_json")).toBe("Suunto app JSON");
  });

  it("falls back to the id for a format this build has never heard of", () => {
    // Not defensiveness: the API derives its format list from its pinned
    // converter on every call, and that pin moves by dependency bump with no
    // change in this repository - so a reader can reach a diver's card before
    // any label for it exists here. `suunto_xml` was the last one to arrive
    // this way and now has a label of its own, which is why this case names a
    // format that does not exist rather than the next one anybody expects: an
    // assertion pinned to a real upcoming id stops testing the fallback the
    // moment that id ships, and starts failing instead.
    expect(importSourceLabel("kraken_binary")).toBe("kraken_binary");
  });
});

describe("the import size ceilings", () => {
  it("match the API's own two", () => {
    // Mirrored from the API's `MAX_DOCUMENT_SIZE` and `MAX_ARCHIVE_SIZE`. A
    // larger value here starts an upload the API will refuse with a 413.
    expect(MAX_IMPORT_DOCUMENT_SIZE).toBe(100 * 1024 * 1024);
    expect(MAX_IMPORT_ARCHIVE_SIZE).toBe(500 * 1024 * 1024);
  });
});
