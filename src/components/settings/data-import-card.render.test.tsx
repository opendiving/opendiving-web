import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataImportCard } from "./data-import-card";
import type { ImportPreview, ImportReport } from "@/lib/api/logbook-import";

// What only a render can reach: that a preview is shown and nothing is written
// until the diver says so, that `restored` survives to the screen as its own
// figure, that a truncated note list admits it is a prefix, and that a bare
// document's uncontained files read as the expected case rather than as damage.
// The two calls behind it are thin `FormData` posts; the presentation helpers are
// pinned in `lib/logbook-import.test.ts`.
const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  apply: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api/logbook-import", async (importOriginal) => ({
  // The constants are real - the size ceilings this card checks against are part
  // of what is under test, and a mocked `MAX_*` would make the check vacuous.
  ...(await importOriginal<typeof import("@/lib/api/logbook-import")>()),
  logbookImportAPI: { preview: mocks.preview, apply: mocks.apply },
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

function report(overrides: Partial<ImportReport> = {}): ImportReport {
  return {
    collections: [],
    files: { referenced: 0, restored: 0, not_contained: 0, skipped: 0 },
    notes: [],
    notes_truncated: 0,
    // Null by default: the ordinary upload is a DiveJSON document the API read
    // as-is, and the conversion block exists only when something was converted.
    conversion: null,
    ...overrides,
  };
}

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    ...report(),
    format: "divejson",
    version: "1.0",
    generator: { name: "OpenDiving", version: "0.4.0" },
    archive: false,
    token: "tok-1",
    ...overrides,
  };
}

const documentFile = () =>
  new File(["{}"], "logbook.divejson", { type: "application/vnd.dive+json" });

async function choose(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input rendered");
  await userEvent.upload(input, file);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the logbook import card", () => {
  it("previews without writing anything, and only applies when asked", async () => {
    mocks.preview.mockResolvedValue(
      preview({
        collections: [
          {
            collection: "dives",
            created: 8,
            linked: 0,
            restored: 0,
            skipped: 0,
          },
        ],
      }),
    );
    mocks.apply.mockResolvedValue(report());

    render(<DataImportCard />);
    await choose(documentFile());

    await waitFor(() =>
      expect(screen.getByText(/nothing has been written yet/i)).toBeVisible(),
    );
    expect(mocks.apply).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: /import this logbook/i }),
    );

    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    // The same file *and* the preview's token: the API re-hashes the body and
    // refuses a token minted for other bytes, so sending one without the other
    // would fail against a real server and pass against a laxer mock.
    expect(mocks.apply.mock.calls[0][1]).toBe("tok-1");
    expect((mocks.apply.mock.calls[0][0] as File).name).toBe(
      "logbook.divejson",
    );
  });

  it("gives restored its own column rather than folding it into created", async () => {
    // The API keeps the four counts disjoint on purpose: `restored` never hides
    // inside `created` or `skipped`, because un-deleting is the one thing import
    // does that nothing else in the app can.
    mocks.preview.mockResolvedValue(
      preview({
        collections: [
          {
            collection: "dives",
            created: 0,
            linked: 7,
            restored: 1,
            skipped: 0,
          },
        ],
      }),
    );

    render(<DataImportCard />);
    await choose(documentFile());

    const table = await screen.findByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: /restored/i }),
    ).toBeVisible();

    const diveRow = within(table).getByRole("row", { name: /dives/i });
    const cells = within(diveRow).getAllByRole("cell");
    // created, linked, restored, skipped - in that order, and the restore is the
    // third rather than being absorbed by the first.
    expect(cells.map((c) => c.textContent)).toEqual(["0", "7", "1", "0"]);
  });

  it("says the note list is a prefix when the API truncated it", async () => {
    mocks.preview.mockResolvedValue(
      preview({
        notes: [
          {
            code: "record_skipped",
            collection: "dives",
            uuid: null,
            message: "A dive could not be represented.",
          },
        ],
        notes_truncated: 112,
      }),
    );

    render(<DataImportCard />);
    await choose(documentFile());

    // Both halves: how many are missing, and that the numbers above are not.
    const line = await screen.findByText(/112 further notes are not shown/i);
    expect(line).toBeVisible();
    expect(line.textContent).toMatch(/counts above are complete/i);
  });

  it("treats a bare document's uncontained files as expected, not as failure", async () => {
    mocks.preview.mockResolvedValue(
      preview({
        archive: false,
        files: { referenced: 4, restored: 0, not_contained: 4, skipped: 0 },
      }),
    );

    render(<DataImportCard />);
    await choose(documentFile());

    // It names the move (import the archive) rather than reporting a fault, and
    // nothing about it is coloured as a warning.
    const hint = await screen.findByText(/import the full archive/i);
    expect(hint).toBeVisible();
    expect(hint.className).not.toMatch(/destructive|amber/);
  });

  it("refuses an oversized document before uploading it", async () => {
    const huge = new File(["x"], "huge.divejson");
    Object.defineProperty(huge, "size", { value: 200 * 1024 * 1024 });

    render(<DataImportCard />);
    await choose(huge);

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "File too large" }),
      ),
    );
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("clears a previous report before previewing a new file", async () => {
    // A preview that fails must not leave the last file's counts standing under
    // the new file's name - the report on screen always describes the file whose
    // name is beside it, or there is no report at all.
    mocks.preview.mockResolvedValueOnce(
      preview({
        collections: [
          {
            collection: "dives",
            created: 8,
            linked: 0,
            restored: 0,
            skipped: 0,
          },
        ],
      }),
    );
    render(<DataImportCard />);
    await choose(documentFile());
    await screen.findByRole("table");

    mocks.preview.mockRejectedValueOnce(new Error("unreadable"));
    await choose(new File(["{"], "broken.divejson"));

    await waitFor(() =>
      expect(screen.queryByRole("table")).not.toBeInTheDocument(),
    );
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });
});
