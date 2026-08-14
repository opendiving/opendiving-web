import { apiClient } from "./client";
import { filenameFromContentDisposition } from "@/lib/download";

/**
 * The three shapes `/export/*` serves a logbook in.
 *
 * The value is the path segment as well as the label, which is why `archive` is not
 * called `zip` - `/export/archive` is the route, `.zip` is only what it saves as.
 */
export type ExportFormat = "uddf" | "csv" | "archive";

/** What each format saves as. The archive is the only one where the two differ. */
const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  uddf: "uddf",
  csv: "csv",
  archive: "zip",
};

/** A fetched export: the bytes, and the name to save them under. */
export interface ExportDownload {
  blob: Blob;
  filename: string;
}

/**
 * The name the API would use, rebuilt here for when its header cannot be read.
 *
 * Mirrors `export_filename` in the API's `services/export/naming.py`, scrub and all:
 * `username` is constrained to `^[a-z0-9]+$` by the profile form, but the admin panel
 * writes the column too, so a value that would need quoting in a filename is squashed
 * rather than trusted.
 *
 * The date is deliberately **UTC**, not local: the server stamps the name from
 * `datetime.now(UTC)`, and a diver in UTC+13 downloading at 09:00 should not get a file
 * dated a day ahead of the one `curl` saves.
 *
 * Exported for its tests, which are what keep this copy honest as the API's rule moves.
 */
export function exportFilename(
  username: string,
  format: ExportFormat,
  now: Date = new Date(),
): string {
  const scrubbed = username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safe = scrubbed || "export";
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");
  return `opendiving-${safe}-${stamp}.${EXPORT_EXTENSIONS[format]}`;
}

export const exportAPI = {
  /**
   * Fetches one of the three exports of the signed-in diver's own logbook.
   *
   * There is no uuid or username parameter because the endpoint has none: the bearer
   * token names the only account there is to export. `username` here is only ever used
   * to rebuild the filename - see `exportFilename`.
   *
   * Goes through the API client rather than a plain `<a href>` for the usual reason
   * (the access token lives in memory, not in a cookie), which means the whole export
   * is buffered as a `Blob` in browser memory before it is saved. That is fine at every
   * log size this app has met and is a real ceiling on the archive of a very large one;
   * DECISIONS.md records the escape hatch.
   */
  async download(
    format: ExportFormat,
    username: string,
  ): Promise<ExportDownload> {
    const response = await apiClient.get<Blob>(`/export/${format}`, {
      responseType: "blob",
    });

    return {
      blob: response.data,
      filename:
        filenameFromContentDisposition(
          response.headers["content-disposition"],
        ) ?? exportFilename(username, format),
    };
  },
};
