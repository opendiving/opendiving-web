/** A picked file, and its path within whatever folder it was dropped in. */
export interface PickedFile {
  file: File;
  /** The file's name, under the folders it was dropped inside, e.g. `Suunto/1.fit`. */
  path: string;
}

/**
 * What a drop carried, taken **synchronously** inside the drop handler: a
 * `DataTransfer`'s items are emptied once the event returns, so the entries have
 * to be read before anything awaits. Hand the result to `walkDrop`.
 */
export function takeDrop(dataTransfer: DataTransfer): {
  entries: FileSystemEntry[];
  files: File[];
} {
  const items = Array.from(dataTransfer.items ?? []).filter(
    (item) => item.kind === "file",
  );
  const entries = items
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null);
  return {
    // Only when every item gave an entry: a browser without the entries API
    // gives none, and a partial list would lose files the `files` list holds.
    entries: entries.length === items.length ? entries : [],
    files: Array.from(dataTransfer.files ?? []),
  };
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

// `readEntries` answers in batches - Chromium's are 100 - and says it is done
// with an empty one, so a folder of 46 files and one of 460 read the same way.
async function childrenOf(
  entry: FileSystemDirectoryEntry,
): Promise<FileSystemEntry[]> {
  const reader = entry.createReader();
  const children: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return children;
    children.push(...batch);
  }
}

async function walk(entry: FileSystemEntry, into: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    into.push({
      file: await fileOf(entry as FileSystemFileEntry),
      path: entry.fullPath.replace(/^\//, "") || entry.name,
    });
  } else if (entry.isDirectory) {
    for (const child of await childrenOf(entry as FileSystemDirectoryEntry)) {
      await walk(child, into);
    }
  }
}

/**
 * Every file a drop carried, a dropped folder walked to its last file. Falls
 * back to the drop's flat file list where the browser offers no entries.
 */
export async function walkDrop({
  entries,
  files,
}: ReturnType<typeof takeDrop>): Promise<PickedFile[]> {
  if (entries.length === 0) {
    return files.map((file) => ({ file, path: file.name }));
  }
  const picked: PickedFile[] = [];
  for (const entry of entries) await walk(entry, picked);
  return picked;
}
