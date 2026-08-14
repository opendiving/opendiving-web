import { describe, it, expect } from "vitest";
import { filenameFromContentDisposition } from "./download";

// The parser exists for one header the app actually meets - the export endpoints'
// `attachment; filename="opendiving-alex-20260814.zip"` - but it is the thing standing
// between a server-chosen string and `link.download`, so the cases worth pinning are
// the ones where it should decline to answer rather than the happy path.

describe("filenameFromContentDisposition", () => {
  it("reads the plain quoted form the export endpoints send", () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="opendiving-alex-20260814.zip"',
      ),
    ).toBe("opendiving-alex-20260814.zip");
  });

  it("reads an unquoted filename", () => {
    expect(
      filenameFromContentDisposition("attachment; filename=dives.uddf"),
    ).toBe("dives.uddf");
  });

  it("is case-insensitive about the parameter name", () => {
    expect(
      filenameFromContentDisposition('attachment; FileName="dives.csv"'),
    ).toBe("dives.csv");
  });

  it("prefers the RFC 6266 extended form, which is the one that can carry non-ASCII", () => {
    // A server sending both means the plain parameter to be the lossy fallback for
    // clients that cannot read `filename*`. Picking the lossy one when the good one
    // is right there would be choosing to mangle the name.
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"opendiving-jarnsaxa.zip\"; filename*=UTF-8''opendiving-j%C3%A4rns%C3%A4xa.zip",
      ),
    ).toBe("opendiving-järnsäxa.zip");
  });

  it("falls back to the plain form when the extended one is malformed", () => {
    // A stray `%` is a `decodeURIComponent` throw, not a bad character. A
    // wrong-but-present name beats failing the download.
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"export.zip\"; filename*=UTF-8''bad%zz.zip",
      ),
    ).toBe("export.zip");
  });

  it("falls back to the plain form for a charset it cannot decode", () => {
    // `decodeURIComponent` only speaks UTF-8, so `%E9` in a Latin-1 name is not a
    // character it can produce. Declining by the declared charset rather than by
    // catching the throw is the difference between a decision and an accident.
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"cafe.zip\"; filename*=ISO-8859-1''caf%E9.zip",
      ),
    ).toBe("cafe.zip");
  });

  it("accepts an extended form with no charset declared", () => {
    // RFC 8187 requires one, but a server that omits it is percent-encoding ASCII,
    // which is exactly what `decodeURIComponent` does anyway.
    expect(
      filenameFromContentDisposition(
        "attachment; filename*=''plain%20name.zip",
      ),
    ).toBe("plain name.zip");
  });

  it("strips a directory part rather than passing it to `link.download`", () => {
    expect(
      filenameFromContentDisposition('attachment; filename="../../etc/passwd"'),
    ).toBe("passwd");
    expect(
      filenameFromContentDisposition(
        'attachment; filename="C:\\Windows\\system.ini"',
      ),
    ).toBe("system.ini");
  });

  it.each([
    // What a cross-origin response without `Access-Control-Expose-Headers` actually
    // hands JS: the header is on the wire, and `response.headers[...]` is undefined.
    // This is the case that runs in production today, so the callers' fallback name
    // is not a defensive branch - it is the normal path.
    ["a missing header", undefined],
    ["an explicit null", null],
    ["an empty header", ""],
    ["a header with no filename at all", "attachment"],
    ["an empty quoted filename", 'attachment; filename=""'],
    ["a filename that is only a path separator", 'attachment; filename="/"'],
  ])("returns null for %s", (_label, header) => {
    expect(filenameFromContentDisposition(header)).toBeNull();
  });
});
