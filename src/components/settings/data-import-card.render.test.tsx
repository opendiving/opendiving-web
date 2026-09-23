import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataImportCard } from "./data-import-card";
import type {
  ConversionReport,
  ImportCheckInDetail,
  ImportPreview,
  ImportReport,
} from "@/lib/api/logbook-import";
import { isoDaysFromNow } from "@/test/local-day";

// What only a render can reach: that a preview is shown and nothing is written
// until the diver says so, that `restored` survives to the screen as its own
// figure, that a truncated note list admits it is a prefix, that a bare
// document's uncontained files read as the expected case rather than as damage,
// and that the conversion section renders for preview and result alike, is
// absent for a native document, and survives a kind and a format this build has
// never seen.
// The two calls behind it are thin `FormData` posts; the presentation helpers are
// pinned in `lib/logbook-import.test.ts`.
const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  apply: vi.fn(),
  toast: vi.fn(),
  refreshUser: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ refreshUser: mocks.refreshUser }),
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
    check_in_details: [],
    ...overrides,
  };
}

function conversion(
  overrides: Partial<ConversionReport> = {},
): ConversionReport {
  return {
    format: "ssrf",
    converter: { name: "divejson", version: "0.3.0" },
    groups: [
      {
        kind: "dropped",
        message: "Visibility is a star rating here, not a distance.",
        count: 8,
        wheres: ["dive/0", "dive/1", "dive/2"],
      },
    ],
    groups_truncated: 0,
    ...overrides,
  };
}

const documentFile = () =>
  new File(["{}"], "logbook.divejson", { type: "application/vnd.dive+json" });

const sourceFile = () =>
  new File(["<divelog/>"], "subsurface.ssrf", { type: "" });

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

  it("names the diver's own file in the header, and says what conversion cost", async () => {
    mocks.preview.mockResolvedValue(
      preview({
        // What the API actually sends for a converted upload: the document's own
        // markers describe the converter's output, and only `conversion` names
        // the file the diver picked.
        format: "divejson",
        version: "1.0",
        generator: { name: "divejson convert", version: "0.3.0" },
        conversion: conversion(),
      }),
    );

    render(<DataImportCard />);
    await choose(sourceFile());

    expect(
      await screen.findByText(
        /Subsurface file, converted to DiveJSON 1\.0 by divejson convert 0\.3\.0/i,
      ),
    ).toBeVisible();

    expect(
      screen.getByRole("heading", { name: /about the original file/i }),
    ).toBeVisible();
    expect(screen.getByText(/star rating here, not a distance/i)).toBeVisible();
    // The kind as a badge, and the count with three of its paths - the count is
    // the complete figure and the paths are a pointer into the source file.
    expect(screen.getByText("Dropped")).toBeVisible();
    expect(
      screen.getByText("8 places — dive/0, dive/1, dive/2 and 5 more"),
    ).toBeVisible();
  });

  it("keeps the conversion section on the result, not only on the preview", async () => {
    // `conversion` is on `ImportReport` rather than on `ImportPreview` for this:
    // the result panel is what stays on screen, and a diver told at preview that
    // their computer's gas mixes could not be carried should still be told after.
    mocks.preview.mockResolvedValue(preview({ conversion: conversion() }));
    mocks.apply.mockResolvedValue(report({ conversion: conversion() }));

    render(<DataImportCard />);
    await choose(sourceFile());
    await screen.findByRole("heading", { name: /about the original file/i });

    await userEvent.click(
      screen.getByRole("button", { name: /import this logbook/i }),
    );

    await screen.findByRole("heading", { name: /^imported$/i });
    expect(
      screen.getByRole("heading", { name: /about the original file/i }),
    ).toBeVisible();
    expect(screen.getByText(/star rating here, not a distance/i)).toBeVisible();
  });

  it("shows no conversion section at all for a native document", async () => {
    // Not an empty section saying nothing was lost: `conversion` is null here
    // because nothing was converted, and a heading would be a claim about a
    // conversion that never happened.
    mocks.preview.mockResolvedValue(preview());

    render(<DataImportCard />);
    await choose(documentFile());
    await screen.findByText(/nothing has been written yet/i);

    expect(
      screen.queryByRole("heading", { name: /about the original file/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a kind and a format from a newer converter rather than breaking", async () => {
    // Reachable with nothing in this repository changing: the API derives its
    // format list from a pinned converter, and that pin moves by dependency
    // bump. An unknown kind reads as information, never as alarm, and an
    // unknown format renders as its id rather than as `undefined`.
    //
    // A `.zip` is the file here on purpose. It is the route by which a format
    // the picker does not yet offer actually reaches this card: a zip whose
    // members are all one source format is read as one logbook, and `.zip` is
    // offered from day one.
    mocks.preview.mockResolvedValue(
      preview({
        generator: null,
        conversion: conversion({
          format: "suunto_xml",
          converter: { name: "divejson", version: "0.4.0" },
          groups: [
            {
              kind: "stretched",
              message: "The sample cadence was normalised.",
              count: 2,
              wheres: [],
            },
          ],
        }),
      }),
    );

    render(<DataImportCard />);
    await choose(
      new File(["PK\x03\x04"], "dives.zip", { type: "application/zip" }),
    );

    expect(
      await screen.findByText(
        /Suunto DM5 XML file, converted to DiveJSON 1\.0 by divejson 0\.4\.0/i,
      ),
    ).toBeVisible();

    const finding = screen.getByText(/sample cadence was normalised/i);
    expect(finding).toBeVisible();
    expect(finding.className).not.toMatch(/destructive|amber/);
    expect(screen.getByText("Stretched")).toBeVisible();
    expect(screen.getByText("2 places")).toBeVisible();
  });

  it("says the findings list is a prefix when the API capped it", async () => {
    mocks.preview.mockResolvedValue(
      preview({ conversion: conversion({ groups_truncated: 3 }) }),
    );

    render(<DataImportCard />);
    await choose(sourceFile());

    const line = await screen.findByText(/3 further findings are not shown/i);
    expect(line).toBeVisible();
    // The record counts are not truncated, only the list of findings is.
    expect(line.textContent).toMatch(/record counts above are complete/i);
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

describe("the check-in details in an import preview", () => {
  const details: ImportCheckInDetail[] = [
    { detail: "born_on", account: null, proposed: "1988-04-02" },
    { detail: "phone", account: "+44 1", proposed: "+44 2" },
    {
      detail: "emergency_contact",
      account: { name: "Sam", phone: "0111", relationship: "Partner" },
      proposed: { name: "Alex", phone: "0456", relationship: null },
    },
    {
      detail: "insurance",
      account: null,
      proposed: { provider: "DAN Europe", number: "P-42", expires_on: null },
    },
  ];

  const applyButton = () =>
    screen.getByRole("button", { name: /import this logbook/i });

  async function previewWith(checkIn: ImportCheckInDetail[]) {
    mocks.preview.mockResolvedValue(preview({ check_in_details: checkIn }));
    render(<DataImportCard />);
    await choose(documentFile());
    await screen.findByText(/nothing has been written yet/i);
  }

  it("shows no section, and sends no facts, for a document carrying none", async () => {
    mocks.apply.mockResolvedValue(report());
    await previewWith([]);

    expect(screen.queryByText("Check-in details")).not.toBeInTheDocument();
    await userEvent.click(applyButton());
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply.mock.calls[0][2]).toBeUndefined();
  });

  it("shows each fact's account value beside the proposal, pre-filled", async () => {
    await previewWith(details);

    const contact = screen.getByRole("group", { name: "Emergency contact" });
    expect(
      within(contact).getByText(/yours now: sam · 0111 · partner/i),
    ).toBeVisible();
    expect(within(contact).getByLabelText("Name")).toHaveValue("Alex");
    expect(screen.getByLabelText("Phone number")).toHaveValue("+44 2");
    const insurance = screen.getByRole("group", { name: "Dive insurance" });
    expect(within(insurance).getByText(/yours now: not set/i)).toBeVisible();
    expect(within(insurance).getByLabelText("Policy number")).toHaveValue(
      "P-42",
    );
  });

  it("sends the facts as edited, and leaves a kept one out", async () => {
    mocks.apply.mockResolvedValue(report());
    await previewWith(details);

    const contact = screen.getByRole("group", { name: "Emergency contact" });
    await userEvent.clear(within(contact).getByLabelText("Their phone number"));
    await userEvent.type(
      within(contact).getByLabelText("Their phone number"),
      "0999",
    );
    const insurance = screen.getByRole("group", { name: "Dive insurance" });
    await userEvent.clear(within(insurance).getByLabelText("Provider"));
    await userEvent.clear(within(insurance).getByLabelText("Policy number"));
    const phone = screen.getByRole("group", { name: "Phone number" });
    await userEvent.click(
      within(phone).getByRole("button", { name: "Keep mine" }),
    );
    expect(within(phone).queryByLabelText("Phone number")).toBeNull();

    await userEvent.click(applyButton());

    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    // The phone is absent rather than null: absent is what leaves the account's
    // alone, and null would clear it.
    expect(mocks.apply.mock.calls[0][2]).toEqual({
      born_on: "1988-04-02",
      emergency_contact: { name: "Alex", phone: "0999", relationship: null },
      insurance: null,
    });
  });

  it("refuses a contact phone without a name before any request", async () => {
    await previewWith(details);

    const contact = screen.getByRole("group", { name: "Emergency contact" });
    await userEvent.clear(within(contact).getByLabelText("Name"));
    await userEvent.click(applyButton());

    expect(
      await screen.findByText(
        "Required while the emergency contact has a phone or a relationship",
      ),
    ).toBeInTheDocument();
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("refuses a date of birth in the future, but not once it is kept", async () => {
    mocks.apply.mockResolvedValue(report());
    await previewWith([
      { detail: "born_on", account: null, proposed: isoDaysFromNow(1) },
    ]);

    await userEvent.click(applyButton());
    expect(
      await screen.findByText("Date of birth cannot be in the future"),
    ).toBeInTheDocument();
    expect(mocks.apply).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Leave unset" }));
    expect(
      screen.queryByText("Date of birth cannot be in the future"),
    ).not.toBeInTheDocument();
    await userEvent.click(applyButton());
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply.mock.calls[0][2]).toBeUndefined();
  });

  it("re-reads the signed-in user only when a fact was written", async () => {
    // A re-read resets every form on the page seeded from the user, so it is
    // spent only when the check-in card would otherwise be showing stale facts.
    mocks.apply.mockResolvedValueOnce(
      report({
        notes: [
          {
            code: "check_in_detail_written",
            collection: null,
            uuid: null,
            message: "The phone number confirmed in the preview was saved.",
          },
        ],
      }),
    );
    await previewWith(details);
    await userEvent.click(applyButton());
    await screen.findByText("Imported");
    expect(mocks.refreshUser).toHaveBeenCalledTimes(1);

    mocks.refreshUser.mockClear();
    mocks.apply.mockResolvedValueOnce(report());
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await choose(documentFile());
    await userEvent.click(
      await screen.findByRole("button", {
        name: /import this logbook/i,
      }),
    );
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(2));
    await screen.findByText("Imported");
    expect(mocks.refreshUser).not.toHaveBeenCalled();
  });
});
