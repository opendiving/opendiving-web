import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ImportPageContent } from "./import-page-content";
import type { DiveNumberingSummary } from "@/lib/api/dives";
import type {
  ImportCheckInDetail,
  ImportCollectionReport,
  ImportDiveReport,
  ImportMemberReport,
  ImportPreview,
  ImportReport,
} from "@/lib/api/logbook-import";

// What only a render reaches: that a read writes nothing and an import sends the
// same files with the read's token; what the client refuses before sending; that
// a change to the files discards the plan; and what the review and the result
// show of the report's rows. The presentation helpers are pinned in
// `lib/logbook-import.test.ts`, the drop walk in `lib/dropped-files.test.ts`.
const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  apply: vi.fn(),
  toast: vi.fn(),
  refreshUser: vi.fn(),
  getDiveNumbering: vi.fn(),
  getNextDiveNumber: vi.fn(),
  renumberDives: vi.fn(),
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
  logbookImportAPI: { preview: mocks.preview, apply: mocks.apply },
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

const MB = 1024 * 1024;

function report(overrides: Partial<ImportReport> = {}): ImportReport {
  return {
    collections: [],
    files: { referenced: 0, restored: 0, not_contained: 0, skipped: 0 },
    notes: [],
    notes_truncated: 0,
    conversion: null,
    members: [],
    dives: [],
    ...overrides,
  };
}

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    ...report(),
    format: "divejson",
    version: "1.0",
    generator: null,
    archive: false,
    token: "tok-1",
    check_in_details: [],
    portrait: null,
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

function dive(overrides: Partial<ImportDiveReport> = {}): ImportDiveReport {
  return {
    uuid: "11111111-1111-4111-8111-111111111111",
    outcome: "created",
    files_added: 0,
    recordings_added: 0,
    reason: null,
    start_time: "2026-09-07T11:04:58.880+03:00",
    duration: 4063,
    max_depth: 21.8,
    device: {
      brand: "suunto",
      model: "Suunto Ocean",
      serial: "253810000400",
      name: "Porvoo",
    },
    members: [0, 1],
    ...overrides,
  };
}

function row(
  collection: string,
  counts: Partial<Omit<ImportCollectionReport, "collection">> = {},
): ImportCollectionReport {
  return {
    collection,
    created: 0,
    linked: 0,
    restored: 0,
    skipped: 0,
    ...counts,
  };
}

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

const readButton = () =>
  screen.getByRole("button", { name: /^read the files/i });
const importButton = () => screen.getByRole("button", { name: /^import/i });

async function readWith(result: ImportPreview, ...files: File[]) {
  mocks.preview.mockResolvedValueOnce(result);
  render(<ImportPageContent />);
  await choose(...(files.length > 0 ? files : [fit(), json()]));
  await userEvent.click(readButton());
  await screen.findByText(/nothing has been written yet/i);
}

const sentNames = (call: unknown[]) =>
  (call[0] as File[]).map((file) => file.name);

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDiveNumbering.mockResolvedValue(numbering());
});

describe("choosing files", () => {
  it("takes several files and filters none", () => {
    render(<ImportPageContent />);
    expect(fileInput()).toHaveAttribute("multiple");
    expect(fileInput()).not.toHaveAttribute("accept");
  });

  it("adds to the selection rather than replacing it, each file removable by name", async () => {
    render(<ImportPageContent />);
    await choose(fit());
    await choose(json());

    expect(screen.getByText("1.fit")).toBeVisible();
    expect(screen.getByText("1.json")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Remove 1.fit" }));
    expect(screen.queryByText("1.fit")).toBeNull();
  });

  it("does not list a hidden or an empty file", async () => {
    render(<ImportPageContent />);
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
  it("holds the read back until its last file has landed", async () => {
    let land: (file: File) => void = () => {};
    const slow = {
      isFile: true,
      isDirectory: false,
      name: "2.fit",
      fullPath: "/2.fit",
      file: (resolve: (file: File) => void) => (land = resolve),
    };
    render(<ImportPageContent />);
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

    await waitFor(() => expect(readButton()).toBeDisabled());
    land(new File(["y"], "2.fit"));

    expect(await screen.findByText("2.fit")).toBeVisible();
    await waitFor(() => expect(readButton()).toBeEnabled());
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
    render(<ImportPageContent />);
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
    render(<ImportPageContent />);
    await choose(sized("backup.zip", 501 * MB, "application/zip"));

    expect(screen.getByText(/zip may be up to 500 MB/)).toBeVisible();
    expect(readButton()).toBeDisabled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("refuses a file over 100 MB that is not a zip in its row, and reads the rest", async () => {
    mocks.preview.mockResolvedValueOnce(preview());
    render(<ImportPageContent />);
    await choose(sized("huge.divejson", 200 * MB), fit());

    expect(screen.getByText(/not a zip may be up to 100 MB/)).toBeVisible();
    await userEvent.click(readButton());

    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1));
    expect(sentNames(mocks.preview.mock.calls[0])).toEqual(["1.fit"]);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("refuses a selection past 500 MB in all, saying to import in parts", async () => {
    render(<ImportPageContent />);
    await choose(
      sized("a.zip", 300 * MB, "application/zip"),
      sized("b.zip", 300 * MB, "application/zip"),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/in parts/);
    expect(readButton()).toBeDisabled();
  });
});

describe("reading", () => {
  it("writes nothing until asked, then imports the same files with the read's token", async () => {
    mocks.apply.mockResolvedValueOnce(report());
    await readWith(preview({ dives: [dive()] }));

    expect(mocks.apply).not.toHaveBeenCalled();
    await userEvent.click(importButton());

    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(sentNames(mocks.apply.mock.calls[0])).toEqual(["1.fit", "1.json"]);
    expect(mocks.apply.mock.calls[0][1]).toBe("tok-1");
  });

  it("shows the upload's bytes on a progress bar while it reads", async () => {
    let finish: (value: ImportPreview) => void = () => {};
    mocks.preview.mockImplementationOnce(
      (_files: File[], onProgress: (sent: number, total: number) => void) => {
        onProgress(3, 7);
        return new Promise((resolve) => (finish = resolve));
      },
    );
    render(<ImportPageContent />);
    await choose(fit(), json());
    await userEvent.click(
      screen.getByRole("button", { name: /^read the files/i }),
    );

    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "7");
    finish(preview());
    await screen.findByText(/nothing has been written yet/i);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("discards the plan when the files change, and offers to read again", async () => {
    await readWith(preview({ dives: [dive()] }));
    expect(screen.getByRole("table")).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove 1.json" }),
    );

    expect(screen.queryByText(/nothing has been written yet/i)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Read the files again" }),
    ).toBeEnabled();
  });

  it("clears a previous report before reading again, and shows the API's refusal in the page", async () => {
    await readWith(preview({ dives: [dive()] }));
    await choose(new File(["y"], "2.fit"));

    mocks.preview.mockRejectedValueOnce({
      response: {
        status: 413,
        data: { detail: "This import would take you past your storage limit." },
      },
    });
    await userEvent.click(readButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This import would take you past your storage limit.",
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});

describe("the files, once read", () => {
  it("says what each file was read as, why one is not kept, and why one is refused", async () => {
    await readWith(
      preview({
        members: [
          member(0, "1.fit"),
          member(1, "1.json", {
            format: "suunto_json",
            kept: false,
            not_kept: "already_stored",
          }),
          member(2, "notes.pdf", {
            format: null,
            kept: false,
            refusal: "This file is not one this app reads.",
          }),
        ],
      }),
      fit(),
      json(),
      new File(["%PDF"], "notes.pdf"),
    );

    expect(screen.getByText("FIT · kept on its dive")).toBeVisible();
    expect(
      screen.getByText(
        "Suunto app JSON · Not kept: your account already has this file",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Refused: This file is not one this app reads."),
    ).toBeVisible();
  });

  it("lists a zip's files under its row", async () => {
    await readWith(
      preview({
        members: [
          member(0, "dives.zip", { format: "zip", opened: 2, kept: false }),
          member(0, "a.fit", { container: 0 }),
          member(0, "b.fit", { container: 0 }),
        ],
      }),
      new File(["PK"], "dives.zip", { type: "application/zip" }),
    );

    expect(screen.getByText("Zip · opened into 2 files")).toBeVisible();
    expect(screen.getByText("a.fit")).toBeVisible();
    expect(screen.getByText("b.fit")).toBeVisible();
  });
});

describe("the dive rows", () => {
  const members = [
    member(0, "1.fit"),
    member(1, "1.json", { format: "suunto_json" }),
  ];

  it("show start, duration, depth, device, files and outcome", async () => {
    await readWith(preview({ members, dives: [dive()] }));

    const cells = within(screen.getAllByRole("row")[1]);
    expect(cells.getByRole("rowheader")).toHaveTextContent(
      "Sep 7, 2026, 11:04 +03:00",
    );
    expect(cells.getAllByText("67:43").length).toBeGreaterThan(0);
    expect(cells.getByText("21.8 m")).toBeVisible();
    expect(
      cells.getAllByText("Suunto Ocean · 253810000400 (Porvoo)").length,
    ).toBeGreaterThan(0);
    expect(cells.getByText("1.fit, 1.json")).toBeVisible();
    expect(cells.getByText("New")).toBeVisible();
  });

  it("say every outcome in the diver's terms, naming a dive the diver has", async () => {
    await readWith(
      preview({
        members,
        dives: [
          dive({ outcome: "created", uuid: "a" }),
          dive({ outcome: "restored", uuid: "b" }),
          dive({ outcome: "linked", uuid: "c" }),
          dive({ outcome: "updated", uuid: "d", files_added: 1 }),
          dive({
            outcome: "updated",
            uuid: "e",
            recordings_added: 1,
            files_added: 1,
          }),
          dive({
            outcome: "skipped",
            uuid: null,
            reason: "It has no samples.",
          }),
        ],
      }),
    );

    const table = screen.getByRole("table");
    for (const outcome of [
      "New",
      "Brought back from deletion",
      "Already in your logbook",
      "Adds a file to a dive you have",
      "Adds a file and another computer's recording to a dive you have",
      "Skipped: It has no samples.",
    ]) {
      expect(within(table).getByText(outcome)).toBeVisible();
    }
    // Before anything is written, only the dives the diver already has are
    // there to open - in a new tab, so the review stays put.
    const links = within(table).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/dives/c",
      "/dives/d",
      "/dives/e",
    ]);
    expect(links[0]).toHaveAttribute("target", "_blank");
  });

  it("show no offset and no midnight for a naive start or a bare date", async () => {
    await readWith(
      preview({
        members,
        dives: [
          dive({ start_time: "2026-09-21T10:47:33" }),
          dive({ start_time: "2002-06-18", uuid: "b" }),
        ],
      }),
    );

    // The start is the cell's first text; a phone's folded columns follow it.
    const starts = screen
      .getAllByRole("rowheader")
      .map((header) => header.firstChild?.textContent);
    expect(starts).toEqual(["Sep 21, 2026, 10:47", "Jun 18, 2002"]);
  });
});

describe("the counts and the files section", () => {
  const counts = [
    row("dives", { created: 23, skipped: 24 }),
    row("sites", { linked: 1 }),
  ];

  it("leave the dives row to the dive rows wherever there are any", async () => {
    await readWith(preview({ collections: counts, dives: [dive()] }));

    const records = screen.getByRole("table", { name: /records by type/i });
    expect(
      within(records).queryByRole("rowheader", { name: "Dives" }),
    ).toBeNull();
    expect(
      within(records).getByRole("rowheader", { name: "Dive sites" }),
    ).toBeVisible();
  });

  it("keep the dives row where there are no dive rows", async () => {
    await readWith(preview({ collections: counts }));

    const records = screen.getByRole("table", { name: /records by type/i });
    expect(
      within(records).getByRole("rowheader", { name: "Dives" }),
    ).toBeVisible();
  });

  it("are absent when nothing but dives counts", async () => {
    await readWith(
      preview({ collections: [row("dives", { created: 2 })], dives: [dive()] }),
    );

    expect(
      screen.queryByRole("table", { name: /records by type/i }),
    ).toBeNull();
    expect(
      screen.queryByText(/collection in this document is empty/),
    ).toBeNull();
  });

  it("show the files section only for a document naming stored files, with its hint", async () => {
    await readWith(preview());
    expect(screen.queryByRole("heading", { name: "Stored Files" })).toBeNull();

    mocks.preview.mockResolvedValueOnce(
      preview({
        files: { referenced: 4, restored: 0, not_contained: 4, skipped: 0 },
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove 1.json" }),
    );
    await userEvent.click(readButton());

    expect(
      await screen.findByRole("heading", { name: "Stored Files" }),
    ).toBeVisible();
    expect(screen.getByText(/import the full archive/i)).toBeVisible();
  });
});

describe("the import button", () => {
  it("counts the dives created or restored", async () => {
    await readWith(
      preview({
        dives: [
          dive(),
          dive({ outcome: "restored" }),
          dive({ outcome: "linked" }),
        ],
      }),
    );
    expect(importButton()).toHaveTextContent("Import 2 dives");
  });

  it("says what updated rows add where nothing is created", async () => {
    await readWith(
      preview({
        dives: [
          dive({ outcome: "updated", files_added: 1 }),
          dive({ outcome: "updated", files_added: 1 }),
        ],
      }),
    );
    expect(importButton()).toHaveTextContent("Import 2 files");
  });

  it.each([
    [
      "linked and skipped rows alone",
      preview({
        dives: [
          dive({ outcome: "linked" }),
          dive({ outcome: "skipped", uuid: null }),
        ],
      }),
    ],
    [
      "a DiveJSON document of gear alone",
      preview({ collections: [row("gear", { created: 3 })] }),
    ],
    [
      "an archive whose dives all link while it restores a trip",
      preview({
        archive: true,
        collections: [
          row("dives", { linked: 2 }),
          row("trips", { restored: 1 }),
        ],
        dives: [dive({ outcome: "linked" }), dive({ outcome: "linked" })],
      }),
    ],
    [
      "a read whose only note is a filled recording",
      preview({
        dives: [dive({ outcome: "linked" })],
        notes: [
          {
            code: "recording_filled",
            collection: "dives",
            uuid: null,
            message: "A recording's blanks were filled.",
          },
        ],
      }),
    ],
  ])("reads Import, enabled, for %s", async (_, plan) => {
    await readWith(plan);
    expect(importButton()).toHaveTextContent(/^Import$/);
    expect(importButton()).toBeEnabled();
  });

  it("is held back while an import is in flight, which shows its progress", async () => {
    let finish: (value: ImportReport) => void = () => {};
    mocks.apply.mockImplementationOnce((...args: unknown[]) => {
      (args[4] as (sent: number, total: number) => void)(1, 2);
      return new Promise((resolve) => (finish = resolve));
    });
    await readWith(preview({ dives: [dive()] }));
    await userEvent.click(importButton());

    expect(
      await screen.findByRole("button", { name: /importing/i }),
    ).toBeDisabled();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    finish(report());
    await screen.findByRole("heading", { name: "Imported" });
  });
});

describe("the result", () => {
  it("lists its dive rows with their outcomes, each linking to its dive, and Done goes to the dives", async () => {
    mocks.apply.mockResolvedValueOnce(
      report({
        members: [member(0, "1.fit"), member(1, "1.json")],
        dives: [
          dive({ uuid: "a" }),
          dive({ uuid: "b", outcome: "linked" }),
          dive({ uuid: null, outcome: "skipped", reason: "No samples." }),
        ],
      }),
    );
    await readWith(preview({ dives: [dive()] }));
    await userEvent.click(importButton());

    await screen.findByRole("heading", { name: "Imported" });
    const table = screen.getByRole("table");
    expect(within(table).getByText("New")).toBeVisible();
    expect(within(table).getByText("Already in your logbook")).toBeVisible();
    expect(within(table).getByText("Skipped: No samples.")).toBeVisible();
    const links = within(table).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/dives/a",
      "/dives/b",
    ]);
    expect(links[0]).not.toHaveAttribute("target");
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute(
      "href",
      "/dives",
    );
  });
});

describe("the result's renumber", () => {
  const earliest = "2019-03-12T12:00:00Z";
  const writeDives = () =>
    mocks.apply.mockResolvedValueOnce(
      report({
        dives: [
          dive({ uuid: "a", start_time: "2019-05-01T12:00:00Z" }),
          dive({ uuid: "b", start_time: earliest }),
          dive({ uuid: "c", outcome: "linked", start_time: "2018-01-01" }),
        ],
      }),
    );

  it("is offered from the earliest new dive's day where the import left dives sharing a number", async () => {
    mocks.getDiveNumbering
      .mockResolvedValueOnce(numbering())
      .mockResolvedValueOnce(
        numbering({
          total_dives: 5,
          highest: 3,
          duplicate_count: 2,
          is_sequential: false,
        }),
      );
    mocks.getNextDiveNumber.mockResolvedValueOnce({
      dive_number: 12,
      is_taken: true,
    });
    mocks.renumberDives.mockResolvedValue({
      dry_run: true,
      dives_in_scope: 4,
      changes: [],
    });
    writeDives();
    await readWith(preview({ dives: [dive()] }));
    await userEvent.click(importButton());

    expect(
      await screen.findByText(/Renumbering from Mar 12, 2019/),
    ).toBeVisible();
    expect(screen.getByText(/2 dives share a number/)).toBeVisible();
    expect(mocks.getNextDiveNumber).toHaveBeenCalledWith(
      "2019-03-11T23:59:59+02:00",
    );

    await userEvent.click(screen.getByRole("button", { name: "Renumber" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Start at")).toHaveValue(12);
    await waitFor(() =>
      expect(mocks.renumberDives).toHaveBeenCalledWith({
        start_at: 12,
        from_start_time: "2019-03-12T00:00:00+02:00",
        dry_run: true,
      }),
    );
  });

  it("gives way to a status that takes focus once the renumber is written", async () => {
    mocks.getDiveNumbering
      .mockResolvedValueOnce(numbering())
      .mockResolvedValueOnce(
        numbering({ out_of_date_order_count: 1, is_sequential: false }),
      );
    mocks.getNextDiveNumber.mockResolvedValueOnce({
      dive_number: 1,
      is_taken: true,
    });
    const change = {
      dive_uuid: "b",
      start_time: earliest,
      dive_number: 4,
      new_dive_number: 1,
    };
    mocks.renumberDives.mockImplementation(
      async ({ dry_run }: { dry_run?: boolean }) => ({
        dry_run: Boolean(dry_run),
        dives_in_scope: 4,
        changes: [change],
      }),
    );
    writeDives();
    await readWith(preview({ dives: [dive()] }));
    await userEvent.click(importButton());

    await userEvent.click(
      await screen.findByRole("button", { name: "Renumber" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Renumber 1 dive" }),
    );

    const status = await screen.findByText("Your dives are renumbered.");
    await waitFor(() => expect(status).toHaveFocus());
    expect(
      screen.queryByRole("button", { name: "Renumber" }),
    ).not.toBeInTheDocument();
  });

  it("is not offered where the import left the log no more tangled than it was", async () => {
    const tangled = numbering({ duplicate_count: 2, is_sequential: false });
    mocks.getDiveNumbering.mockResolvedValue(tangled);
    writeDives();
    await readWith(preview({ dives: [dive()] }));
    await userEvent.click(importButton());

    await screen.findByRole("heading", { name: "Imported" });
    await waitFor(() =>
      expect(mocks.getDiveNumbering).toHaveBeenCalledTimes(2),
    );
    expect(
      screen.queryByRole("button", { name: "Renumber" }),
    ).not.toBeInTheDocument();
    expect(mocks.getNextDiveNumber).not.toHaveBeenCalled();
  });

  it("is not offered where the log's numbering could not be read with the files", async () => {
    mocks.getDiveNumbering.mockRejectedValueOnce(new Error("offline"));
    writeDives();
    await readWith(preview({ dives: [dive()] }));
    await userEvent.click(importButton());

    await screen.findByRole("heading", { name: "Imported" });
    expect(mocks.getDiveNumbering).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Renumber" }),
    ).not.toBeInTheDocument();
  });
});

describe("the check-in details and the portrait", () => {
  const details: ImportCheckInDetail[] = [
    { detail: "phone", account: "+44 1", proposed: "+44 2" },
  ];
  const sha = "b".repeat(64);
  const proposed = "data:image/webp;base64,UklGRg==";

  it("shows the details a document proposes without an archive, and sends them as edited", async () => {
    mocks.apply.mockResolvedValueOnce(report());
    await readWith(preview({ archive: false, check_in_details: details }));

    const phone = screen.getByRole("group", { name: "Phone number" });
    expect(within(phone).getByText(/yours now: \+44 1/i)).toBeVisible();
    expect(within(phone).getByLabelText("Phone number")).toHaveValue("+44 2");

    await userEvent.click(importButton());
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply.mock.calls[0][2]).toEqual({ phone: "+44 2" });
  });

  it("offers the archive's portrait beside the account's, and sends keep after Keep mine", async () => {
    mocks.apply.mockResolvedValueOnce(report());
    await readWith(
      preview({ archive: true, portrait: { account_sha256: sha, proposed } }),
      new File(["PK"], "backup.zip", { type: "application/zip" }),
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
    expect(mocks.apply.mock.calls[0][3]).toEqual({
      choice: "keep",
      account_sha256: sha,
    });
  });

  it("re-reads the signed-in user only when a fact was written", async () => {
    mocks.apply.mockResolvedValueOnce(
      report({
        notes: [
          {
            code: "check_in_detail_written",
            collection: null,
            uuid: null,
            message: "The phone number was saved.",
          },
        ],
      }),
    );
    await readWith(preview({ check_in_details: details }));
    await userEvent.click(importButton());

    await screen.findByRole("heading", { name: "Imported" });
    expect(mocks.refreshUser).toHaveBeenCalledTimes(1);
  });
});
