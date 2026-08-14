import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportAPI, exportFilename } from "./export";

vi.mock("./client", () => ({
  apiClient: { get: vi.fn() },
}));

const { apiClient } = await import("./client");
const get = vi.mocked(apiClient.get);

beforeEach(() => {
  get.mockReset();
});

// `exportFilename` mirrors `export_filename` in the API's `services/export/naming.py`.
// Duplicated logic in two languages is normally a smell; here it is the fallback for a
// header the browser refuses to hand us cross-origin, so what these tests are really
// pinning is that the copy still matches the original.
describe("exportFilename", () => {
  const noon = new Date("2026-08-14T12:00:00Z");

  it.each([
    ["uddf" as const, "opendiving-alex-20260814.uddf"],
    ["csv" as const, "opendiving-alex-20260814.csv"],
    // `archive` is the route; `.zip` is what it saves as. The only row where the
    // format name and the extension differ.
    ["archive" as const, "opendiving-alex-20260814.zip"],
  ])("names a %s export", (format, expected) => {
    expect(exportFilename("alex", format, noon)).toBe(expected);
  });

  it("stamps the UTC date, not the local one", () => {
    // 23:30 UTC on the 14th is the 15th in UTC+13. The server names the file from
    // `datetime.now(UTC)`, so a diver in Auckland must not get a name a day ahead of
    // what `curl` saves from the same request.
    expect(
      exportFilename("alex", "csv", new Date("2026-08-14T23:30:00Z")),
    ).toBe("opendiving-alex-20260814.csv");
  });

  it.each([
    ["Alex.Vesnin", "opendiving-alex-vesnin-20260814.csv"],
    ["  spaced  name  ", "opendiving-spaced-name-20260814.csv"],
    // Scrubbed to nothing. The API substitutes the literal "export" rather than
    // producing `opendiving--20260814.csv`, and so does this.
    ["...", "opendiving-export-20260814.csv"],
    ["", "opendiving-export-20260814.csv"],
  ])("scrubs %o the way the API does", (username, expected) => {
    // The profile form constrains usernames to `^[a-z0-9]+$`, but the admin panel
    // writes the column too, so neither side trusts the value.
    expect(exportFilename(username, "csv", noon)).toBe(expected);
  });
});

describe("exportAPI.download", () => {
  it("requests the format's route as a blob", async () => {
    get.mockResolvedValue({ data: new Blob(["<uddf/>"]), headers: {} });

    await exportAPI.download("uddf", "alex");

    expect(get).toHaveBeenCalledWith("/export/uddf", { responseType: "blob" });
  });

  it("takes the filename from the server when the header is readable", async () => {
    get.mockResolvedValue({
      data: new Blob(["<uddf/>"]),
      headers: {
        "content-disposition":
          'attachment; filename="opendiving-alex-20200101.uddf"',
      },
    });

    const { filename } = await exportAPI.download("uddf", "alex");

    // Note the date: 2020, which no fallback would ever produce. The server's answer
    // wins over the locally derived one whenever there is one to have.
    expect(filename).toBe("opendiving-alex-20200101.uddf");
  });

  it("derives the filename when the header is not exposed to JS", async () => {
    // The cross-origin case, which is every request in the app as it ships: the
    // header is on the wire and `headers` does not carry it.
    get.mockResolvedValue({ data: new Blob(["zip"]), headers: {} });

    const { filename } = await exportAPI.download("archive", "alex");

    expect(filename).toMatch(/^opendiving-alex-\d{8}\.zip$/);
  });

  it("hands back the response body untouched", async () => {
    const blob = new Blob(["number,date\n"], { type: "text/csv" });
    get.mockResolvedValue({ data: blob, headers: {} });

    await expect(exportAPI.download("csv", "alex")).resolves.toMatchObject({
      blob,
    });
  });

  it("lets a failure through for the caller to toast", async () => {
    // The card shows `getApiErrorMessage(error)`, and the client's interceptor has
    // already unwrapped the blob error body by the time it gets here - so swallowing
    // a rejection into a fake empty download is the one thing this must not do.
    get.mockRejectedValue(new Error("429"));

    await expect(exportAPI.download("archive", "alex")).rejects.toThrow("429");
  });
});
