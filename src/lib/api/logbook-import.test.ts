import { describe, expect, it, vi } from "vitest";
import {
  DIVE_COMPUTER_FILE_ACCEPT,
  importSourceLabel,
  logbookImportAPI,
  LOGBOOK_IMPORT_SOURCE_EXTENSIONS,
  MAX_IMPORT_ARCHIVE_SIZE,
  MAX_IMPORT_DOCUMENT_SIZE,
  MAX_IMPORT_FILES,
  type ImportSourceFormat,
} from "./logbook-import";

vi.mock("./client", () => ({
  apiClient: { post: vi.fn().mockResolvedValue({ data: {} }) },
}));

const { apiClient } = await import("./client");
const post = vi.mocked(apiClient.post);

describe("DIVE_COMPUTER_FILE_ACCEPT", () => {
  it("is the dive form's list, unchanged by the Import page filtering nothing", () => {
    // An independent literal, `satisfies` against the union, so a format added
    // to `ImportSourceFormat` and left out of the map stops this file compiling
    // rather than quietly disappearing from the form's file dialog.
    const extensionsByFormat = {
      uddf: [".uddf"],
      ssrf: [".ssrf"],
      fit: [".fit"],
      suunto_json: [".json"],
      suunto_xml: [".xml"],
    } satisfies Record<ImportSourceFormat, readonly string[]>;

    expect(LOGBOOK_IMPORT_SOURCE_EXTENSIONS).toEqual(extensionsByFormat);
    expect(DIVE_COMPUTER_FILE_ACCEPT.split(",")).toEqual([
      ".uddf",
      ".ssrf",
      ".fit",
      ".json",
      ".xml",
    ]);
  });

  it("leaves out DiveJSON and a zip, which the parse route refuses", () => {
    const offered = DIVE_COMPUTER_FILE_ACCEPT.split(",");
    expect(offered).not.toContain(".divejson");
    expect(offered).not.toContain(".zip");
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

  it("names what an import reports beside the converter's formats", () => {
    // Labels without becoming extensions: none of these is a file the dive
    // form takes, which the list above pins.
    expect(importSourceLabel("divejson")).toBe("DiveJSON");
    expect(importSourceLabel("archive")).toBe("OpenDiving archive");
    expect(importSourceLabel("zip")).toBe("Zip");
    expect(importSourceLabel("mixed")).toBe("Several formats");
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

describe("the import ceilings", () => {
  it("match the API's own", () => {
    // Mirrored from the API's `MAX_DOCUMENT_SIZE`, `MAX_ARCHIVE_SIZE` and
    // `MAX_PARTS`. A larger value here starts an upload the API will refuse.
    expect(MAX_IMPORT_DOCUMENT_SIZE).toBe(100 * 1024 * 1024);
    expect(MAX_IMPORT_ARCHIVE_SIZE).toBe(500 * 1024 * 1024);
    expect(MAX_IMPORT_FILES).toBe(1000);
  });
});

describe("the batch requests", () => {
  const files = [
    new File(["a"], "1.fit"),
    new File(["b"], "1.json"),
    new File(["c"], "logbook.zip"),
  ];
  const sentForm = () => post.mock.lastCall![1] as FormData;
  const sentConfig = () =>
    post.mock.lastCall![2] as {
      headers: Record<string, unknown>;
      onUploadProgress?: (event: { loaded: number; total?: number }) => void;
    };

  it("sends every file as a `file` part, in order, to the preview", async () => {
    await logbookImportAPI.preview(files);

    expect(post.mock.lastCall![0]).toBe("/import/logbook/preview");
    expect(
      (sentForm().getAll("file") as File[]).map((file) => file.name),
    ).toEqual(["1.fit", "1.json", "logbook.zip"]);
    // Cleared so the browser writes the multipart boundary itself.
    expect(sentConfig().headers["Content-Type"]).toBeUndefined();
  });

  it("sends the same files beside the token to the apply", async () => {
    await logbookImportAPI.apply(files, "tok");

    expect(post.mock.lastCall![0]).toBe("/import/logbook");
    expect(sentForm().getAll("file")).toHaveLength(3);
    expect(sentForm().get("token")).toBe("tok");
  });

  it("reports the upload's bytes to a progress callback", async () => {
    const onProgress = vi.fn();
    await logbookImportAPI.preview(files, onProgress);

    sentConfig().onUploadProgress!({ loaded: 40, total: 100 });
    expect(onProgress).toHaveBeenCalledWith(40, 100);
  });

  it("asks for no progress when nobody listens", async () => {
    await logbookImportAPI.preview(files);
    expect(sentConfig().onUploadProgress).toBeUndefined();
  });

  it("sends the portrait's choice with the digest the preview showed", async () => {
    await logbookImportAPI.apply(files, "tok", undefined, {
      choice: "keep",
      account_sha256: null,
    });
    // `account_sha256` goes even when null: the API requires the key.
    expect(JSON.parse(sentForm().get("portrait") as string)).toEqual({
      choice: "keep",
      account_sha256: null,
    });
    expect(sentForm().get("check_in_details")).toBeNull();
  });

  it("sends no portrait field without a choice, which keeps the account's", async () => {
    await logbookImportAPI.apply(files, "tok");
    expect(sentForm().has("portrait")).toBe(false);
  });
});
