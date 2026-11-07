import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ImportDetailPageContent } from "./import-detail-page-content";
import { ImportLogPageContent } from "./import-log-page-content";
import { ImportPageContent } from "./import-page-content";
import type { DiveNumberingSummary, Recording } from "@/lib/api/dives";
import type {
  ImportCheckInDetail,
  ImportCollectionReport,
  ImportMemberReport,
  ImportNoteGroup,
  LogbookImportDiveNotes,
  LogbookImportNotes,
  LogbookImportRead,
  LogbookImportSummary,
} from "@/lib/api/logbook-import";
import { dive as storedDive, importDiveRow } from "@/test/dive-fixtures";

// What only a render reaches: which of the picker and the review the account's
// state draws, that the files go up once and the apply sends none, what the client
// refuses before sending, and what the review, the result and the log show of the
// import. The presentation helpers are pinned in `lib/logbook-import.test.ts`, the
// changes' labels in `lib/import-changes.test.ts`, the drop walk in
// `lib/dropped-files.test.ts`.
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  pending: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  notes: vi.fn(),
  apply: vi.fn(),
  remove: vi.fn(),
  toast: vi.fn(),
  refreshUser: vi.fn(),
  reloadCheckinDetails: vi.fn(),
  getDiveNumbering: vi.fn(),
  getNextDiveNumber: vi.fn(),
  renumberDives: vi.fn(),
  routerReplace: vi.fn(),
  routerPush: vi.fn(),
  params: { id: "import-1" },
  search: "",
}));

vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({
    user: { name: "Alex", units: "metric" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { name: "Alex", units: "metric" },
    refreshUser: mocks.refreshUser,
  }),
}));

// The shared check-in details, which an apply that wrote one has read again.
vi.mock("@/contexts/CheckinDetailsContext", () => ({
  useCheckinDetails: () => ({
    details: null,
    loadFailed: false,
    reload: mocks.reloadCheckinDetails,
    save: vi.fn(),
  }),
}));

// The account's portrait is fetched through this, the endpoint being owner-only.
vi.mock("@/hooks/useAuthedBlobUrl", () => ({
  useAuthedBlobUrl: (fetchBlob: unknown) => ({
    url: fetchBlob ? "blob:portrait" : null,
    isLoading: false,
    hasError: false,
    error: null,
  }),
}));

vi.mock("@/lib/api/logbook-import", async (importOriginal) => ({
  // The constants are real - the bounds this page checks against are part of
  // what is under test, and a mocked `MAX_*` would make the check vacuous.
  ...(await importOriginal<typeof import("@/lib/api/logbook-import")>()),
  logbookImportAPI: {
    create: mocks.create,
    pending: mocks.pending,
    list: mocks.list,
    get: mocks.get,
    notes: mocks.notes,
    apply: mocks.apply,
    remove: mocks.remove,
  },
}));

vi.mock("@/lib/api/dives", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dives")>()),
  divesAPI: {
    getDiveNumbering: mocks.getDiveNumbering,
    getNextDiveNumber: mocks.getNextDiveNumber,
    renumberDives: mocks.renumberDives,
  },
}));

// Pinned so the day a renumber's scope starts on is the same wherever the suite
// runs; `importRenumberScope`'s own tests cover the offsets.
vi.mock("@/lib/date-time", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/date-time")>()),
  getBrowserUtcOffsetMinutes: () => 120,
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

// The map's tiles are `MapBackdrop`'s own tests'; a card's backdrop mounts near
// the viewport, which jsdom does not have.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/import",
  useSearchParams: () => new URLSearchParams(mocks.search),
  useParams: () => mocks.params,
  useRouter: () => ({ replace: mocks.routerReplace, push: mocks.routerPush }),
}));

const MB = 1024 * 1024;

const notFound = () =>
  Object.assign(new Error("Not found"), { response: { status: 404 } });
const refused = (status: number, detail?: string) =>
  Object.assign(new Error("Refused"), {
    response: { status, data: detail ? { detail } : {} },
  });

function numbering(
  overrides: Partial<DiveNumberingSummary> = {},
): DiveNumberingSummary {
  return {
    total_dives: 3,
    lowest: 1,
    highest: 3,
    missing_count: 0,
    duplicate_count: 0,
    out_of_date_order_count: 0,
    is_sequential: true,
    ...overrides,
  };
}

function pendingImport(
  overrides: Partial<LogbookImportRead> = {},
): LogbookImportRead {
  return {
    uuid: "import-1",
    status: "pending",
    created_at: "2026-11-07T10:00:00Z",
    applied_at: null,
    expires_at: "2026-11-08T10:00:00Z",
    archive: false,
    members: [],
    collections: [],
    files: { referenced: 0, restored: 0, not_contained: 0, skipped: 0 },
    dives: [],
    check_in_details: [],
    portrait: null,
    numbering: numbering(),
    ...overrides,
  };
}

function appliedImport(
  overrides: Partial<LogbookImportRead> = {},
): LogbookImportRead {
  return pendingImport({
    status: "applied",
    applied_at: "2026-11-07T11:00:00Z",
    ...overrides,
  });
}

function group(overrides: Partial<ImportNoteGroup> = {}): ImportNoteGroup {
  return {
    code: "tags_created",
    kind: null,
    collection: null,
    message: "",
    count: 1,
    wheres: [],
    ...overrides,
  };
}

function member(
  part: number,
  name: string,
  overrides: Partial<ImportMemberReport> = {},
): ImportMemberReport {
  return {
    part,
    container: null,
    name,
    byte_size: 1,
    sha256: `${part}`.padStart(64, "0"),
    format: "fit",
    opened: null,
    kept: true,
    not_kept: null,
    refusal: null,
    ...overrides,
  };
}

function row(
  collection: string,
  counts: Partial<Omit<ImportCollectionReport, "collection">> = {},
): ImportCollectionReport {
  return { collection, created: 0, linked: 0, skipped: 0, ...counts };
}

function recording(overrides: Partial<Recording> = {}): Recording {
  return {
    uuid: "recording-1",
    ordinal: 0,
    device: { model: "Perdix 3" },
    files: [],
    ...overrides,
  };
}

function log(overrides: Partial<LogbookImportNotes> = {}): LogbookImportNotes {
  return { dives: [], notes: [], notes_truncated: 0, ...overrides };
}

function logDive(
  overrides: Partial<LogbookImportDiveNotes> = {},
): LogbookImportDiveNotes {
  return {
    uuid: "dive-1",
    start_time: "2026-09-07T11:04:58+03:00",
    device: { model: "Perdix 3" },
    outcome: "unchanged",
    reason: null,
    notes: [],
    notes_truncated: 0,
    ...overrides,
  };
}

const newRow = (number = 1) =>
  importDiveRow({
    uuid: `dive-${number}`,
    dive: storedDive({
      uuid: `dive-${number}`,
      dive_number: number,
      start_time: "2026-09-07T11:04:58+03:00",
      submerged_time: 4063,
      max_depth: 21.8,
    }),
  });
const modifiedRow = (number = 2) =>
  importDiveRow({
    uuid: `dive-${number}`,
    outcome: "modified",
    dive: storedDive({ uuid: `dive-${number}`, dive_number: number }),
    changes: [
      { member: "max_depth", before: 21, after: 21.8 },
      {
        member: "recordings/0/files/1",
        before: null,
        after: { original_filename: "dive.json" },
      },
      { member: "recordings/0/some_new_member", before: 1, after: 2 },
    ],
  });
const unchangedRow = () =>
  importDiveRow({ uuid: "dive-9", outcome: "unchanged", dive: null });
const skippedRow = () =>
  importDiveRow({
    uuid: null,
    outcome: "skipped",
    dive: null,
    reason: "It has no start time.",
  });

const fit = () => new File(["fit"], "1.fit");
const json = () => new File(["json"], "1.json");

function sized(name: string, bytes: number, type = "") {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

const fileInput = () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input rendered");
  return input;
};

async function choose(...files: File[]) {
  await userEvent.upload(fileInput(), files);
}

const uploadButton = () => screen.getByRole("button", { name: "Upload" });
const importButton = () => screen.getByRole("button", { name: /^import/i });

// The page with no pending import.
async function drawPicker() {
  render(<ImportPageContent />);
  await screen.findByRole("button", { name: /drop files or a folder here/i });
}

// The page with a pending import.
async function drawReview(record: LogbookImportRead) {
  mocks.pending.mockResolvedValue(record);
  render(<ImportPageContent />);
  await screen.findByRole("heading", { name: /review this import/i });
}

// A result has an address of its own, so `/import` leaves for it.
const resultShown = () =>
  waitFor(() =>
    expect(mocks.routerReplace).toHaveBeenCalledWith("/import/import-1"),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = "";
  mocks.pending.mockReset();
  mocks.pending.mockRejectedValue(notFound());
  mocks.list.mockResolvedValue({
    data: [],
    total_count: 0,
    has_more: false,
    page: 1,
    items_per_page: 20,
  });
  mocks.notes.mockResolvedValue(log());
  mocks.getDiveNumbering.mockResolvedValue(numbering());
});

describe("choosing files", () => {
  it("takes several files and filters none", async () => {
    await drawPicker();
    expect(fileInput()).toHaveAttribute("multiple");
    expect(fileInput()).not.toHaveAttribute("accept");
  });

  it("adds to the selection rather than replacing it, each file removable by name", async () => {
    await drawPicker();
    await choose(fit());
    await choose(json());

    expect(screen.getByText("1.fit")).toBeVisible();
    expect(screen.getByText("1.json")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Remove 1.fit" }));
    expect(screen.queryByText("1.fit")).toBeNull();
  });

  it("does not list a hidden or an empty file", async () => {
    await drawPicker();
    await choose(new File([], "empty.fit"));
    fireEvent.drop(
      screen.getByRole("button", { name: /drop files or a folder here/i }),
      {
        dataTransfer: {
          items: [],
          files: [new File(["x"], ".DS_Store"), fit()],
        },
      },
    );

    expect(await screen.findByText("1.fit")).toBeVisible();
    expect(screen.queryByText(".DS_Store")).toBeNull();
    expect(screen.queryByText("empty.fit")).toBeNull();
  });
});

describe("a folder still being walked", () => {
  it("holds the upload back until its last file has landed", async () => {
    let land: (file: File) => void = () => {};
    const slow = {
      isFile: true,
      isDirectory: false,
      name: "2.fit",
      fullPath: "/2.fit",
      file: (resolve: (file: File) => void) => (land = resolve),
    };
    await drawPicker();
    await choose(fit());
    fireEvent.drop(
      screen.getByRole("button", { name: /drop files or a folder here/i }),
      {
        dataTransfer: {
          items: [{ kind: "file", webkitGetAsEntry: () => slow }],
          files: [],
        },
      },
    );

    await waitFor(() => expect(uploadButton()).toBeDisabled());
    land(new File(["y"], "2.fit"));

    expect(await screen.findByText("2.fit")).toBeVisible();
    await waitFor(() => expect(uploadButton()).toBeEnabled());
  });
});

describe("a drop the browser could not read all of", () => {
  it("says which entries were left out", async () => {
    const moved = {
      isFile: true,
      isDirectory: false,
      name: "moved.fit",
      fullPath: "/moved.fit",
      file: (_: unknown, reject: (error: unknown) => void) =>
        reject(new Error("NotFoundError")),
    };
    const kept = {
      isFile: true,
      isDirectory: false,
      name: "1.fit",
      fullPath: "/1.fit",
      file: (resolve: (file: File) => void) => resolve(fit()),
    };
    await drawPicker();
    fireEvent.drop(
      screen.getByRole("button", { name: /drop files or a folder here/i }),
      {
        dataTransfer: {
          items: [moved, kept].map((entry) => ({
            kind: "file",
            webkitGetAsEntry: () => entry,
          })),
          files: [],
        },
      },
    );

    expect(await screen.findByText("1.fit")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "The browser could not read this from the drop, so it was left out: moved.fit.",
    );
  });
});

describe("what the client refuses before sending", () => {
  it("refuses a zip over 500 MB in its row, sending nothing", async () => {
    await drawPicker();
    await choose(sized("backup.zip", 501 * MB, "application/zip"));

    expect(screen.getByText(/zip may be up to 500 MB/)).toBeVisible();
    expect(uploadButton()).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses a file over 100 MB that is not a zip in its row, and sends the rest", async () => {
    mocks.create.mockResolvedValueOnce(pendingImport());
    await drawPicker();
    await choose(sized("huge.divejson", 200 * MB), fit());

    expect(screen.getByText(/not a zip may be up to 100 MB/)).toBeVisible();
    await userEvent.click(uploadButton());

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(
      (mocks.create.mock.calls[0][0] as File[]).map((file) => file.name),
    ).toEqual(["1.fit"]);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("refuses a selection past 500 MB in all, saying to import in parts", async () => {
    await drawPicker();
    await choose(
      sized("a.zip", 300 * MB, "application/zip"),
      sized("b.zip", 300 * MB, "application/zip"),
    );

    expect(
      screen.getAllByRole("alert").find((region) => region.textContent),
    ).toHaveTextContent(/in parts/);
    expect(uploadButton()).toBeDisabled();
  });
});

describe("uploading", () => {
  it("sends the files once, then shows the review with no picker", async () => {
    mocks.create.mockResolvedValueOnce(pendingImport({ dives: [newRow()] }));
    await drawPicker();
    await choose(fit(), json());
    await userEvent.click(uploadButton());

    await screen.findByRole("heading", { name: /review this import/i });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(
      (mocks.create.mock.calls[0][0] as File[]).map((file) => file.name),
    ).toEqual(["1.fit", "1.json"]);
    expect(
      screen.queryByRole("button", { name: /drop files or a folder here/i }),
    ).toBeNull();
  });

  it("shows the upload's bytes on a progress bar, then that the server is reading", async () => {
    let finish: (value: LogbookImportRead) => void = () => {};
    mocks.create.mockImplementationOnce(
      (_: File[], onProgress: (sent: number, total: number) => void) => {
        onProgress(1, 2);
        return new Promise((resolve) => (finish = resolve));
      },
    );
    await drawPicker();
    await choose(fit());
    await userEvent.click(uploadButton());

    expect(screen.getByRole("progressbar")).toBeVisible();
    expect(screen.getByText(/^Uploading/)).toBeVisible();
    expect(uploadButton()).toBeDisabled();

    finish(pendingImport());
    await screen.findByRole("heading", { name: /review this import/i });
  });

  it("shows the API's refusal in the page, keeping the files", async () => {
    mocks.create.mockRejectedValueOnce(
      refused(415, "Nothing here reads that."),
    );
    await drawPicker();
    await choose(fit());
    await userEvent.click(uploadButton());

    expect(await screen.findByText("Nothing here reads that.")).toBeVisible();
    expect(screen.getByText("1.fit")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /open the pending import/i }),
    ).toBeNull();
  });

  it("reads a 409's detail and offers to open the pending import", async () => {
    mocks.create.mockRejectedValueOnce(
      refused(409, "Import x is waiting to be finished."),
    );
    await drawPicker();
    await choose(fit());
    await userEvent.click(uploadButton());
    expect(
      await screen.findByText("Import x is waiting to be finished."),
    ).toBeVisible();

    mocks.pending.mockResolvedValue(pendingImport());
    await userEvent.click(
      screen.getByRole("button", { name: /open the pending import/i }),
    );

    await screen.findByRole("heading", { name: /review this import/i });
  });
});

describe("the page with no pending import", () => {
  const summary = (
    overrides: Partial<LogbookImportSummary> = {},
  ): LogbookImportSummary => ({
    uuid: "import-0",
    created_at: "2026-11-01T10:00:00Z",
    applied_at: "2026-11-01T11:00:00Z",
    counts: { new: 12, modified: 2 },
    ...overrides,
  });

  it("lists the applied imports, each opening its own page", async () => {
    mocks.list.mockResolvedValue({
      data: [summary()],
      total_count: 1,
      has_more: false,
      page: 1,
      items_per_page: 20,
    });
    await drawPicker();

    const heading = await screen.findByRole("heading", {
      name: /previous imports/i,
    });
    expect(heading).toBeVisible();
    const link = screen.getByRole("link", { name: /12 new, 2 modified/ });
    expect(link.getAttribute("href")).toMatch(/^\/import\/import-0/);
  });

  it("has no history section while there is nothing to list", async () => {
    await drawPicker();
    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    expect(
      screen.queryByRole("heading", { name: /previous imports/i }),
    ).toBeNull();
  });

  it("says so, and offers to try again, where the import could not be read", async () => {
    mocks.pending.mockRejectedValueOnce(refused(500));
    render(<ImportPageContent />);

    await userEvent.click(
      await screen.findByRole("button", { name: /try again/i }),
    );
    expect(
      await screen.findByRole("button", {
        name: /drop files or a folder here/i,
      }),
    ).toBeVisible();
  });
});

describe("the review", () => {
  it("puts the refused files first, each one sentence naming no code", async () => {
    await drawReview(
      pendingImport({
        members: [
          member(0, "1.fit"),
          member(1, "notes.txt", {
            format: null,
            kept: false,
            refusal: "This is not a dive file.",
          }),
        ],
        dives: [newRow()],
      }),
    );

    const refusedList = screen.getByRole("list", {
      name: /files that could not be read/i,
    });
    expect(within(refusedList).getAllByRole("listitem")).toHaveLength(1);
    expect(refusedList).toHaveTextContent(
      "notes.txt: This is not a dive file.",
    );
    expect(
      refusedList.compareDocumentPosition(screen.getByText(/1 new dive/)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("has no refused section where every file read", async () => {
    await drawReview(pendingImport({ members: [member(0, "1.fit")] }));
    expect(
      screen.queryByRole("list", { name: /files that could not be read/i }),
    ).toBeNull();
  });

  it("counts the rows, the unchanged and skipped terms leading to the log", async () => {
    await drawReview(
      pendingImport({
        dives: [
          newRow(1),
          newRow(2),
          modifiedRow(3),
          unchangedRow(),
          skippedRow(),
        ],
      }),
    );

    const unchanged = screen.getByRole("link", { name: "1 unchanged" });
    expect(unchanged).toHaveAttribute(
      "href",
      "/import/import-1/log?from=%2Fimport",
    );
    expect(screen.getByRole("link", { name: "1 skipped" })).toHaveAttribute(
      "href",
      "/import/import-1/log?from=%2Fimport",
    );
    expect(unchanged.closest("p")).toHaveTextContent(
      "2 new dives, 1 modified, 1 unchanged, 1 skipped",
    );
  });

  it("draws one card per new or modified row, each with its chip, and none for the rest", async () => {
    await drawReview(
      pendingImport({
        dives: [newRow(1), modifiedRow(2), unchangedRow(), skippedRow()],
      }),
    );

    expect(
      screen.getByRole("button", { name: /^New dive: Dive #1/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /^What changes on Dive #2/ }),
    ).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("New")).toBeVisible();
    expect(screen.getByText("Modified")).toBeVisible();
    // A card is a button: no link to a dive that may not exist yet, and no menu.
    expect(screen.queryByRole("link", { name: /dive #1/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /actions for/i })).toBeNull();
  });

  it("counts a new dive's sightings as the species seen", async () => {
    const seen = newRow();
    await drawReview(
      pendingImport({
        dives: [
          {
            ...seen,
            dive: storedDive({
              ...seen.dive!,
              max_depth: 10,
              sightings: [
                {
                  uuid: "s1",
                  scientific_name: "Manta alfredi",
                  common_name: null,
                  rank: "Species",
                  count: null,
                  abundance: null,
                  notes: "",
                },
              ],
            }),
          },
        ],
      }),
    );

    expect(screen.getByText("Species seen")).toBeVisible();
  });

  it("opens a new dive's panel with the info, tanks and recordings", async () => {
    const shown = newRow();
    await drawReview(
      pendingImport({
        dives: [
          {
            ...shown,
            dive: storedDive({
              ...shown.dive!,
              boat_name: "Blue Horizon",
              mixtures: [
                { oxygen: 32, helium: 0, volume: 12, start_pressure: 200 },
              ],
              recordings: [
                recording({
                  ordinal: 1,
                  uuid: "second",
                  device: { model: "Suunto Ocean" },
                  files: [
                    {
                      uuid: "f2",
                      original_filename: "ocean.fit",
                      content_type: "application/octet-stream",
                      byte_size: 1,
                      parser_key: "fit",
                      attach_order: 1,
                    },
                  ],
                }),
                recording({
                  files: [
                    {
                      uuid: "f1",
                      original_filename: "perdix.uddf",
                      content_type: "application/xml",
                      byte_size: 1,
                      parser_key: "uddf",
                      attach_order: 0,
                    },
                  ],
                  profile: {
                    uuid: "p1",
                    duration: 3_000_000,
                    depth_sample_count: 300,
                    provenance: "file",
                    channels: ["depth"],
                    max_depth: 21.8,
                  },
                }),
              ],
            }),
          },
        ],
      }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /^New dive: Dive #1/ }),
    );

    const panel = await screen.findByRole("dialog");
    for (const heading of [
      "Location",
      "Dive info",
      "Environment",
      "Gear",
      "Notes",
      "Tanks",
      "Recordings",
    ]) {
      expect(
        within(panel).getByRole("heading", { name: heading }),
      ).toBeVisible();
    }
    expect(within(panel).getByText("Blue Horizon")).toBeVisible();
    expect(within(panel).getByText(/EAN32, 12 L/)).toBeVisible();
    expect(within(panel).getByText("perdix.uddf · UDDF")).toBeVisible();
    expect(within(panel).getByText(/300 samples/)).toBeVisible();
    // In ordinal order, whatever order the read gave.
    expect(
      within(panel)
        .getByText("Perdix 3")
        .compareDocumentPosition(within(panel).getByText("Suunto Ocean")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens a modified dive's panel with one row per change", async () => {
    await drawReview(pendingImport({ dives: [modifiedRow()] }));

    await userEvent.click(
      screen.getByRole("button", { name: /^What changes on Dive #2/ }),
    );

    const panel = await screen.findByRole("dialog");
    expect(within(panel).getAllByRole("listitem")).toHaveLength(3);
    expect(within(panel).getByText("Maximum depth")).toBeVisible();
    expect(within(panel).getByText("21 m")).toBeVisible();
    expect(within(panel).getByText("21.8 m")).toBeVisible();
    expect(within(panel).getByText("File added — dive.json")).toBeVisible();
    // One this build has no label for, by its path rather than hidden.
    expect(
      within(panel).getByText("recordings/0/some_new_member"),
    ).toBeVisible();
    // Only the changes, never the info sections.
    expect(
      within(panel).queryByRole("heading", { name: "Location" }),
    ).toBeNull();
  });

  it("shows the collection counts without the dives row, and the files section", async () => {
    await drawReview(
      pendingImport({
        collections: [
          row("dives", { created: 1 }),
          row("sites", { linked: 2 }),
        ],
        files: { referenced: 3, restored: 0, not_contained: 3, skipped: 0 },
        dives: [newRow()],
      }),
    );

    const table = screen.getByRole("table");
    expect(within(table).getByText("Dive sites")).toBeVisible();
    expect(within(table).queryByText("Dives")).toBeNull();
    expect(screen.getByText(/3 named — 0 restored/)).toBeVisible();
    expect(screen.getByText(/import the full archive/)).toBeVisible();
  });

  it("links to the log", async () => {
    await drawReview(pendingImport());
    expect(screen.getByRole("link", { name: "Import log" })).toHaveAttribute(
      "href",
      "/import/import-1/log?from=%2Fimport",
    );
  });
});

describe("the import button", () => {
  it.each([
    ["new and modified rows", [newRow(1), modifiedRow(2)], "Import 2 dives"],
    ["one row", [modifiedRow(2), unchangedRow()], "Import 1 dive"],
    ["only rows with no card", [unchangedRow(), skippedRow()], "Import"],
    ["no rows", [], "Import"],
  ])("is labelled from %s and enabled", async (_, dives, label) => {
    await drawReview(pendingImport({ dives }));
    const button = screen.getByRole("button", { name: label });
    expect(button).toBeEnabled();
  });

  it("is held back while the apply is in flight", async () => {
    let finish: (value: LogbookImportRead) => void = () => {};
    mocks.apply.mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    await drawReview(pendingImport({ dives: [newRow()] }));
    await userEvent.click(importButton());

    const importing = await screen.findByRole("button", {
      name: /importing/i,
    });
    expect(importing).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();

    finish(appliedImport());
    await resultShown();
  });
});

describe("applying", () => {
  it("sends no files, and moves to the import's own address", async () => {
    mocks.apply.mockResolvedValueOnce(appliedImport({ dives: [newRow()] }));
    await drawReview(pendingImport({ dives: [newRow()] }));
    await userEvent.click(importButton());

    await resultShown();
    expect(mocks.apply).toHaveBeenCalledWith("import-1", {
      check_in_details: undefined,
      portrait: undefined,
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([409, 404])(
    "reads the pending import again on a %i, showing what it finds",
    async (status) => {
      mocks.apply.mockRejectedValueOnce(refused(status));
      await drawReview(pendingImport());
      mocks.pending.mockReset();
      mocks.pending.mockRejectedValue(notFound());
      await userEvent.click(importButton());

      expect(
        await screen.findByRole("button", {
          name: /drop files or a folder here/i,
        }),
      ).toBeVisible();
      expect(mocks.pending).toHaveBeenCalledTimes(1);
    },
  );

  it("shows a 429's detail and stays on the review", async () => {
    mocks.apply.mockRejectedValueOnce(refused(429, "Too many imports."));
    await drawReview(pendingImport());
    await userEvent.click(importButton());

    expect(await screen.findByText("Too many imports.")).toBeVisible();
    expect(importButton()).toBeEnabled();
  });
});

describe("discarding", () => {
  const confirm = async () => {
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Discard" }),
    );
  };

  it("asks once, deletes naming the status, and goes back to the picker", async () => {
    mocks.remove.mockResolvedValueOnce(undefined);
    await drawReview(pendingImport());
    mocks.pending.mockReset();
    mocks.pending.mockRejectedValue(notFound());

    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Discard",
      }),
    );

    expect(
      await screen.findByRole("button", {
        name: /drop files or a folder here/i,
      }),
    ).toBeVisible();
    expect(mocks.remove).toHaveBeenCalledWith("import-1", "pending");
  });

  it("reads the pending import again on a 409", async () => {
    mocks.remove.mockRejectedValueOnce(refused(409));
    await drawReview(pendingImport());
    mocks.pending.mockReset();
    mocks.pending.mockRejectedValue(notFound());
    await confirm();

    expect(
      await screen.findByRole("button", {
        name: /drop files or a folder here/i,
      }),
    ).toBeVisible();
    expect(mocks.pending).toHaveBeenCalledTimes(1);
  });
});

describe("the result", () => {
  async function drawResult(record: LogbookImportRead) {
    mocks.get.mockResolvedValue(record);
    render(<ImportDetailPageContent />);
    await screen.findByRole("heading", { name: "Imported" });
  }

  it("links a new card to its row's dive, and Done goes to the dives", async () => {
    const overtaken = newRow(1);
    await drawResult(
      appliedImport({
        // A row the apply settled onto a dive that held it names that dive.
        dives: [{ ...overtaken, uuid: "stored-dive" }],
      }),
    );

    expect(
      screen.getByRole("link", { name: "Dive #1" }).getAttribute("href"),
    ).toMatch(/^\/dives\/stored-dive/);
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute(
      "href",
      "/dives",
    );
  });

  it("opens a modified card's changes, with a link to its row's dive", async () => {
    const row = modifiedRow(2);
    await drawResult(
      appliedImport({
        // The dive inside the row may carry an identifier that names nothing.
        dives: [
          {
            ...row,
            uuid: "stored-dive",
            dive: storedDive({ ...row.dive!, uuid: "stale" }),
          },
        ],
      }),
    );

    expect(screen.queryByRole("link", { name: "Dive #2" })).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: /^What changed on Dive #2/ }),
    );

    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("21 m")).toBeVisible();
    expect(within(panel).getByText("21.8 m")).toBeVisible();
    expect(
      within(panel)
        .getByRole("link", { name: "Open this dive" })
        .getAttribute("href"),
    ).toMatch(/^\/dives\/stored-dive/);
  });

  it("closes the panel on the way to the dive, for the way back", async () => {
    await drawResult(appliedImport({ dives: [modifiedRow(2)] }));
    await userEvent.click(
      screen.getByRole("button", { name: /^What changed on Dive #2/ }),
    );

    const panel = await screen.findByRole("dialog");
    const link = within(panel).getByRole("link", { name: "Open this dive" });
    // jsdom has no navigation for the link to perform.
    link.addEventListener("click", (event) => event.preventDefault());
    await userEvent.click(link);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers a review's panel no link to a dive not yet written", async () => {
    await drawReview(pendingImport({ dives: [modifiedRow(2)] }));
    await userEvent.click(
      screen.getByRole("button", { name: /^What changes on Dive #2/ }),
    );

    const panel = await screen.findByRole("dialog");
    expect(
      within(panel).queryByRole("link", { name: "Open this dive" }),
    ).toBeNull();
  });

  it("counts a skipped row that keeps its dive, and draws it no card", async () => {
    await drawResult(
      appliedImport({
        dives: [
          { ...modifiedRow(2), outcome: "skipped", reason: "Deleted here." },
        ],
      }),
    );

    expect(screen.getByRole("link", { name: "1 skipped dive" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Dive #2" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Dive #2/ })).toBeNull();
  });

  it("draws a row the review did not show that has no uuid without a link", async () => {
    await drawResult(appliedImport({ dives: [{ ...newRow(4), uuid: null }] }));
    expect(screen.getByText("Dive #4")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Dive #4" })).toBeNull();
  });

  it("has no check-in section and no import controls", async () => {
    await drawResult(appliedImport());
    expect(screen.queryByRole("button", { name: /^import/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
  });

  it("offers Delete, which asks once and leaves for the import page", async () => {
    mocks.remove.mockResolvedValueOnce(undefined);
    await drawResult(appliedImport());

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith("import-1", "applied"),
    );
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/import"),
    );
  });

  it("offers the renumber from the import's own numbering", async () => {
    mocks.getDiveNumbering.mockResolvedValue(
      numbering({ duplicate_count: 2, is_sequential: false }),
    );
    mocks.getNextDiveNumber.mockResolvedValue({ dive_number: 7 });
    await drawResult(appliedImport({ dives: [newRow()] }));

    expect(
      await screen.findByRole("button", { name: "Renumber" }),
    ).toBeVisible();
    expect(mocks.getDiveNumbering).toHaveBeenCalledTimes(1);
  });

  it("does not offer it where the log was as tangled at the upload", async () => {
    const tangled = numbering({ duplicate_count: 2, is_sequential: false });
    mocks.getDiveNumbering.mockResolvedValue(tangled);
    await drawResult(appliedImport({ dives: [newRow()], numbering: tangled }));

    await waitFor(() => expect(mocks.getDiveNumbering).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Renumber" })).toBeNull();
  });
});

describe("an import by its address", () => {
  it("renders a pending import's review on a reload", async () => {
    mocks.get.mockResolvedValue(pendingImport({ dives: [newRow()] }));
    render(<ImportDetailPageContent />);

    await screen.findByRole("heading", { name: /review this import/i });
    expect(mocks.get).toHaveBeenCalledWith("import-1");
    expect(importButton()).toBeEnabled();
  });

  it("goes to /import when another device got there first", async () => {
    mocks.get.mockResolvedValue(pendingImport());
    mocks.apply.mockRejectedValueOnce(refused(409));
    render(<ImportDetailPageContent />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^import/i }),
    );

    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/import"),
    );
  });

  it("shows the result in place after its own apply", async () => {
    mocks.get.mockResolvedValue(pendingImport());
    mocks.apply.mockResolvedValueOnce(appliedImport());
    render(<ImportDetailPageContent />);
    await userEvent.click(
      await screen.findByRole("button", { name: /^import/i }),
    );

    await screen.findByRole("heading", { name: "Imported" });
  });
});

describe("the log page", () => {
  const drawLog = async (notes: LogbookImportNotes) => {
    mocks.notes.mockResolvedValue(notes);
    render(<ImportLogPageContent />);
    await screen.findByRole("heading", { name: /^Dives|^Notes/ });
  };

  it("renders on a reload and links back to the import", async () => {
    await drawLog(log({ dives: [logDive()] }));

    expect(mocks.notes).toHaveBeenCalledWith("import-1");
    expect(screen.getByRole("heading", { name: "Import log" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to import" }),
    ).toHaveAttribute("href", "/import/import-1");
  });

  it("goes back to the page it was opened from, which holds the diver's choices", async () => {
    mocks.search = "from=/import";
    await drawLog(log({ dives: [logDive()] }));

    expect(
      screen.getByRole("link", { name: "Back to import" }),
    ).toHaveAttribute("href", "/import");
  });

  it("heads each dive with its start, device and outcome, and a skipped one's reason", async () => {
    await drawLog(
      log({
        dives: [
          logDive({
            outcome: "skipped",
            uuid: null,
            reason: "It has no start time.",
          }),
          logDive({ outcome: "new", device: null }),
        ],
      }),
    );

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings[0]).toHaveTextContent(/\+03:00 · Perdix 3 · Skipped$/);
    expect(headings[1]).toHaveTextContent(/\+03:00 · New$/);
    expect(screen.getByText("It has no start time.")).toBeVisible();
  });

  it("shows no offset and no midnight for a naive start or a bare date", async () => {
    await drawLog(
      log({
        dives: [
          logDive({ start_time: "2026-09-07T11:04:58", device: null }),
          logDive({ start_time: "2002-06-18", device: null }),
        ],
      }),
    );

    const [naive, bare] = screen.getAllByRole("heading", { level: 3 });
    expect(naive).not.toHaveTextContent(/[+-]\d\d:\d\d/);
    expect(bare.textContent).not.toMatch(/:/);
  });

  it("lists a dive's notes under it, and says where its cap cut them", async () => {
    await drawLog(
      log({
        dives: [
          logDive({
            notes: [
              {
                code: "review_unshown",
                kind: null,
                collection: "dives",
                message: "The review did not show this dive.",
              },
              {
                code: "from_a_later_build",
                kind: "from_a_later_build",
                collection: "dives",
                message: "A later note.",
              },
            ],
            notes_truncated: 2,
          }),
        ],
      }),
    );

    expect(
      screen.getByText("The review did not show this dive."),
    ).toBeVisible();
    // A code and a kind this build has never heard of read as information.
    expect(screen.getByText(/A later note\./)).toBeVisible();
    expect(screen.getByText("From a later build")).toBeVisible();
    expect(screen.getByText(/2 further notes about this dive/)).toBeVisible();
  });

  it("lists the report's groups, with how often and where they came up", async () => {
    await drawLog(
      log({
        notes: [
          group({
            code: "value_dropped",
            kind: "dropped",
            message: "Visibility has no metric equivalent.",
            count: 5,
            wheres: ["dives.uddf/dive/0"],
          }),
        ],
        notes_truncated: 1,
      }),
    );

    expect(screen.getByRole("heading", { name: "Notes (1)" })).toBeVisible();
    expect(
      screen.getByText(/5 places — dives.uddf\/dive\/0 and 4 more/),
    ).toBeVisible();
    expect(screen.getByText(/1 further note is not shown/)).toBeVisible();
  });
});

describe("the check-in details and the portrait", () => {
  const details: ImportCheckInDetail[] = [
    { detail: "phone", account: "+44 1", proposed: "+44 2" },
  ];
  const sha = "b".repeat(64);
  const proposed = "data:image/webp;base64,UklGRg==";

  it("shows the details a document proposes, and sends them as edited", async () => {
    mocks.apply.mockResolvedValueOnce(appliedImport());
    await drawReview(pendingImport({ check_in_details: details }));

    const phone = screen.getByRole("group", { name: "Phone number" });
    expect(within(phone).getByText(/yours now: \+44 1/i)).toBeVisible();
    expect(within(phone).getByLabelText("Phone number")).toHaveValue("+44 2");

    await userEvent.click(importButton());
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply.mock.calls[0][1].check_in_details).toEqual({
      phone: "+44 2",
    });
  });

  it("proposes a list whole, edits it as a list, and sends it whole", async () => {
    mocks.apply.mockResolvedValueOnce(appliedImport());
    await drawReview(
      pendingImport({
        check_in_details: [
          {
            detail: "emergency_contacts",
            account: [{ name: "Alex", phone: null, relationship: null }],
            proposed: [
              { name: "Robin", phone: "0222", relationship: "Parent" },
              { name: "Alex", phone: null, relationship: null },
            ],
          },
          {
            detail: "insurance_policies",
            account: [
              { provider: "DAN", number: "P-1", expires_on: "2027-03-01" },
            ],
            proposed: [
              { provider: "DAN", number: "P-1", expires_on: "2027-03-01" },
            ],
          },
        ],
      }),
    );

    const contacts = screen.getByRole("group", { name: "Emergency contacts" });
    expect(within(contacts).getByText(/yours now: alex/i)).toBeVisible();
    expect(
      within(contacts).getByRole("textbox", { name: "Name contact 1 of 2" }),
    ).toHaveValue("Robin");
    await userEvent.click(
      within(contacts).getByRole("button", { name: "Remove Alex" }),
    );
    const policies = screen.getByRole("group", { name: "Insurance policies" });
    await userEvent.click(
      within(policies).getByRole("button", { name: "Keep mine" }),
    );
    await userEvent.click(importButton());

    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    // The edited list whole; the kept one left out, which leaves the account's.
    expect(mocks.apply.mock.calls[0][1].check_in_details).toEqual({
      emergency_contacts: [
        { name: "Robin", phone: "0222", relationship: "Parent" },
      ],
    });
  });

  it("offers the archive's portrait beside the account's, and sends keep after Keep mine", async () => {
    mocks.apply.mockResolvedValueOnce(appliedImport());
    await drawReview(
      pendingImport({
        archive: true,
        portrait: { account_sha256: sha, proposed },
      }),
    );

    const portrait = screen.getByRole("group", { name: "Portrait" });
    expect(
      within(portrait).getByAltText("Portrait from the import"),
    ).toHaveAttribute("src", proposed);
    await userEvent.click(
      within(portrait).getByRole("button", { name: "Keep mine" }),
    );
    await userEvent.click(importButton());

    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply.mock.calls[0][1].portrait).toEqual({
      choice: "keep",
      account_sha256: sha,
    });
  });

  it("re-reads the check-in details and the signed-in user when the log says a detail was written", async () => {
    mocks.apply.mockResolvedValueOnce(appliedImport());
    mocks.notes.mockResolvedValueOnce(
      log({
        notes: [
          group({
            code: "check_in_detail_written",
            message: "The phone number was saved.",
          }),
        ],
      }),
    );
    await drawReview(pendingImport({ check_in_details: details }));
    await userEvent.click(importButton());

    await resultShown();
    // The shared copy every check-in surface shows, and the user record that carries
    // the portrait's digest - one note marks both.
    expect(mocks.reloadCheckinDetails).toHaveBeenCalledTimes(1);
    expect(mocks.refreshUser).toHaveBeenCalledTimes(1);
  });

  it("leaves them alone where nothing was written", async () => {
    mocks.apply.mockResolvedValueOnce(appliedImport());
    await drawReview(pendingImport({ check_in_details: details }));
    await userEvent.click(importButton());

    await resultShown();
    expect(mocks.reloadCheckinDetails).not.toHaveBeenCalled();
  });

  it("reads no log where the import offered nothing", async () => {
    mocks.apply.mockResolvedValueOnce(appliedImport());
    await drawReview(pendingImport());
    await userEvent.click(importButton());

    await resultShown();
    expect(mocks.notes).not.toHaveBeenCalled();
  });
});
