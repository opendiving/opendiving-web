import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataExportCard } from "./data-export-card";

// The card holds no logic worth unit-testing - naming lives in `lib/api/export.ts` and
// is tested there. What only a render reaches is the wiring between three visually
// identical buttons and three different endpoints, and the two states a diver notices
// when it goes wrong: a spinner on the wrong row, or a failure that saves nothing and
// says nothing.

vi.mock("@/lib/api/export", () => ({
  exportAPI: { download: vi.fn() },
}));

vi.mock("@/lib/download", () => ({
  downloadBlob: vi.fn(),
}));

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const { exportAPI } = await import("@/lib/api/export");
const { downloadBlob } = await import("@/lib/download");

const download = vi.mocked(exportAPI.download);
const save = vi.mocked(downloadBlob);

beforeEach(() => {
  download.mockReset();
  save.mockReset();
  toast.mockReset();
});

// A row's button is queried by its accessible name, which is also what changes when the
// row goes busy - so `downloadButton` finding it at all is the assertion that it is
// idle, and `busyButton` that it is not.
function downloadButton(label: string) {
  return screen.getByRole("button", { name: `Download ${label}` });
}

function busyButton(label: string) {
  return screen.getByRole("button", { name: `Preparing ${label} export` });
}

// `aria-disabled`, not `disabled` - the card uses the advisory attribute so a busy
// button keeps focus and its changed name gets announced, which means jest-dom's
// `toBeDisabled`/`toBeEnabled` (which only read the real attribute) would pass on a
// button that had lost its guard entirely.
function expectInert(button: HTMLElement) {
  expect(button).toHaveAttribute("aria-disabled", "true");
}

function expectLive(button: HTMLElement) {
  expect(button).not.toHaveAttribute("aria-disabled", "true");
  expect(button).toBeEnabled();
}

// A download the test releases by hand, so the in-flight state can be asserted on.
function deferred() {
  let release: (value: { blob: Blob; filename: string }) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<{ blob: Blob; filename: string }>(
    (resolve, fail) => {
      release = resolve;
      reject = fail;
    },
  );
  return { promise, release, reject };
}

describe("DataExportCard", () => {
  it("offers all three exports", () => {
    render(<DataExportCard username="alex" />);

    expect(downloadButton("UDDF")).toBeInTheDocument();
    expect(downloadButton("Spreadsheet")).toBeInTheDocument();
    expect(downloadButton("Full archive")).toBeInTheDocument();
  });

  it("says the archive carries the certification scans", () => {
    // The one sentence here that is a warning rather than a description. It is on the
    // archive row specifically because that is the only file that contains them.
    render(<DataExportCard username="alex" />);

    expect(screen.getByText(/personal documents/i)).toBeInTheDocument();
  });

  it.each([
    ["UDDF", "uddf"],
    ["Spreadsheet", "csv"],
    ["Full archive", "archive"],
  ])("fetches and saves the %s export", async (label, format) => {
    const blob = new Blob(["bytes"]);
    download.mockResolvedValue({ blob, filename: `export.${format}` });
    render(<DataExportCard username="alex" />);

    await userEvent.click(downloadButton(label));

    await waitFor(() => expect(download).toHaveBeenCalledWith(format, "alex"));
    // The server's name, not one the card made up - the card never derives one.
    expect(save).toHaveBeenCalledWith(blob, `export.${format}`);
  });

  it("only busies the row being fetched", async () => {
    // A shared boolean would grey out all three buttons because one is running, which
    // reads as "the whole card is broken" on a download that takes a while - and the
    // archive is exactly the one that takes a while.
    const archive = deferred();
    download.mockReturnValue(archive.promise);
    render(<DataExportCard username="alex" />);

    await userEvent.click(downloadButton("Full archive"));

    await waitFor(() => expectInert(busyButton("Full archive")));
    expectLive(downloadButton("UDDF"));
    expectLive(downloadButton("Spreadsheet"));

    archive.release({ blob: new Blob(["zip"]), filename: "export.zip" });
    await waitFor(() => expectLive(downloadButton("Full archive")));
  });

  it("ignores a second click on the row already fetching", async () => {
    // `aria-disabled` is advisory - the button still receives the click - so the guard
    // in `handleDownload` is the whole of what stops a double-click saving the same
    // file twice. (Not what stops a second *request*: the API client dedupes in-flight
    // GETs, so the duplicate would join the pending one. It is the second
    // `downloadBlob` that reaches the diver, as two identical files.)
    const archive = deferred();
    download.mockReturnValue(archive.promise);
    render(<DataExportCard username="alex" />);

    await userEvent.click(downloadButton("Full archive"));
    await waitFor(() => expect(busyButton("Full archive")).toBeInTheDocument());
    await userEvent.click(busyButton("Full archive"));

    expect(download).toHaveBeenCalledTimes(1);

    archive.release({ blob: new Blob(["zip"]), filename: "export.zip" });
    await waitFor(() => expectLive(downloadButton("Full archive")));
  });

  it("keeps each concurrent download's own busy state", async () => {
    // The bug a single `ExportFormat | null` had: the other two buttons stay enabled on
    // purpose, so a diver can start a second export while the first is still fetching -
    // and then whichever request landed first cleared *both* spinners, leaving a row
    // that is still fetching looking idle.
    const archive = deferred();
    const csv = deferred();
    download.mockImplementation((format) =>
      format === "archive" ? archive.promise : csv.promise,
    );
    render(<DataExportCard username="alex" />);

    await userEvent.click(downloadButton("Full archive"));
    await waitFor(() => expect(busyButton("Full archive")).toBeInTheDocument());
    await userEvent.click(downloadButton("Spreadsheet"));
    await waitFor(() => expect(busyButton("Spreadsheet")).toBeInTheDocument());

    // The fast one finishes first. The slow one must not notice.
    csv.release({ blob: new Blob(["csv"]), filename: "export.csv" });
    await waitFor(() => expectLive(downloadButton("Spreadsheet")));
    expectInert(busyButton("Full archive"));

    archive.release({ blob: new Blob(["zip"]), filename: "export.zip" });
    await waitFor(() => expectLive(downloadButton("Full archive")));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("clears only the failing row when one of two concurrent downloads fails", async () => {
    // The same race through the `catch`/`finally` path rather than the happy one: a 429
    // on the second export must not re-enable the first row while it is still fetching.
    const archive = deferred();
    const csv = deferred();
    download.mockImplementation((format) =>
      format === "archive" ? archive.promise : csv.promise,
    );
    render(<DataExportCard username="alex" />);

    await userEvent.click(downloadButton("Full archive"));
    await waitFor(() => expect(busyButton("Full archive")).toBeInTheDocument());
    await userEvent.click(downloadButton("Spreadsheet"));
    await waitFor(() => expect(busyButton("Spreadsheet")).toBeInTheDocument());

    csv.reject({
      response: {
        data: { detail: "Too many requests. Please try again later." },
      },
    });

    await waitFor(() => expectLive(downloadButton("Spreadsheet")));
    expect(toast).toHaveBeenCalledTimes(1);
    expectInert(busyButton("Full archive"));
  });

  it("toasts the API's own message on failure and saves nothing", async () => {
    // The 429 the export rate limit produces. Its `detail` reaches this point already
    // unwrapped from the blob body by the client's interceptor, so what matters here
    // is that the card shows it rather than its own generic sentence.
    download.mockRejectedValue({
      response: {
        data: { detail: "Too many requests. Please try again later." },
      },
    });
    render(<DataExportCard username="alex" />);

    await userEvent.click(downloadButton("Full archive"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Too many requests. Please try again later.",
          variant: "destructive",
        }),
      ),
    );
    expect(save).not.toHaveBeenCalled();
    // Re-enabled, so a rate limit that clears in a minute does not need a reload.
    expectLive(downloadButton("Full archive"));
  });

  it("names the file in the fallback message rather than a lowercased title", async () => {
    // Only reached when the API sends no `detail` at all, but "your uddf" reads like a
    // typo where "your UDDF" reads like the file it is.
    download.mockRejectedValue(new Error("network"));
    render(<DataExportCard username="alex" />);

    await userEvent.click(downloadButton("UDDF"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Could not export your UDDF. Please try again.",
        }),
      ),
    );
  });
});
