import { describe, expect, it } from "vitest";

import { takeDrop, walkDrop } from "./dropped-files";

// jsdom has no entries API, so the entries are fakes of its callback shape - the
// part under test is the walk: every file of every folder, with its path, read
// through `readEntries`' batches to the empty one that ends them.

function fileEntry(fullPath: string) {
  const name = fullPath.split("/").pop()!;
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath,
    file: (resolve: (file: File) => void) => resolve(new File(["x"], name)),
  };
}

function folderEntry(fullPath: string, children: unknown[], batch = 2) {
  return {
    isFile: false,
    isDirectory: true,
    name: fullPath.split("/").pop()!,
    fullPath,
    createReader: () => {
      let offset = 0;
      return {
        readEntries: (resolve: (entries: unknown[]) => void) => {
          resolve(children.slice(offset, offset + batch));
          offset += batch;
        },
      };
    },
  };
}

function transfer(entries: unknown[], files: File[] = []): DataTransfer {
  return {
    items: entries.map((entry) => ({
      kind: "file",
      webkitGetAsEntry: () => entry,
    })),
    files,
  } as unknown as DataTransfer;
}

describe("a dropped folder", () => {
  it("is walked to its last file, past more than one batch, with each file's path", async () => {
    const drop = transfer([
      folderEntry("/Suunto", [
        fileEntry("/Suunto/1.fit"),
        fileEntry("/Suunto/1.json"),
        fileEntry("/Suunto/2.fit"),
        folderEntry("/Suunto/Old", [fileEntry("/Suunto/Old/0.fit")]),
      ]),
      fileEntry("/logbook.uddf"),
    ]);

    const picked = await walkDrop(takeDrop(drop));

    expect(picked.map(({ path }) => path)).toEqual([
      "Suunto/1.fit",
      "Suunto/1.json",
      "Suunto/2.fit",
      "Suunto/Old/0.fit",
      "logbook.uddf",
    ]);
    expect(picked[0].file.name).toBe("1.fit");
  });
});

describe("a drop from a browser without entries", () => {
  it("falls back to the drop's own file list", async () => {
    const files = [new File(["x"], "1.fit"), new File(["y"], "1.json")];
    const drop = {
      items: files.map(() => ({ kind: "file" })),
      files,
    } as unknown as DataTransfer;

    const picked = await walkDrop(takeDrop(drop));

    expect(picked.map(({ path }) => path)).toEqual(["1.fit", "1.json"]);
  });
});
