import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DiveRecordingFiles,
  type PendingDiveFile,
} from "./dive-recording-files";
import type { DiveFileInfo, Recording } from "@/lib/api/dives";

// **Structure, not geometry.** jsdom gives every element a zero-sized rect, so an
// assertion about where a delete control sits relative to a file name passes
// against any markup at all and tests nothing. What a render can actually pin is
// the shape the layout is built on - one row per file, one delete control inside
// each row, the device named in the row it belongs to - and that is what is here.
// Whether those rows survive 375px without overlapping is measured in a real
// browser instead.

function file(overrides: Partial<DiveFileInfo> = {}): DiveFileInfo {
  return {
    uuid: "f1",
    original_filename: "dive.fit",
    content_type: "application/octet-stream",
    byte_size: 4096,
    parser_key: "fit",
    ...overrides,
  };
}

function recording(overrides: Partial<Recording> = {}): Recording {
  return { uuid: "r1", ordinal: 0, files: [], ...overrides };
}

function pending(overrides: Partial<PendingDiveFile> = {}): PendingDiveFile {
  return {
    id: "p1",
    file: new File(["x"], "picked.fit"),
    token: "tok",
    deviceLabel: "Suunto Ocean",
    ...overrides,
  };
}

describe("DiveRecordingFiles", () => {
  it("renders nothing when the dive holds no files and none are waiting", () => {
    // A dive logged by hand. An empty box under the picker is a place for the
    // eye to stop and says nothing.
    const { container } = render(
      <DiveRecordingFiles
        recordings={[]}
        pending={[]}
        onRemovePending={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("gives every file its own row, with the device inside that row", () => {
    render(
      <DiveRecordingFiles
        recordings={[
          recording({
            device: { brand: "Suunto", model: "Suunto Ocean" },
            files: [
              file({ uuid: "a", original_filename: "ocean.json" }),
              file({ uuid: "b", original_filename: "ocean.fit" }),
            ],
          }),
        ]}
        pending={[]}
        onRemovePending={vi.fn()}
        onDeleteStored={vi.fn()}
      />,
    );

    const rows = screen.getAllByTestId("dive-file-row");
    expect(rows).toHaveLength(2);
    // The device is *in the row*, not in a heading above the group: the row is
    // what a diver reads to answer "which computer is this file from", and a
    // heading is a different answer once a dive has two recordings.
    expect(within(rows[0]).getByText("ocean.json")).toBeVisible();
    expect(within(rows[0]).getByText(/Suunto Ocean/)).toBeVisible();
    expect(within(rows[1]).getByText("ocean.fit")).toBeVisible();
    expect(within(rows[1]).getByText(/Suunto Ocean/)).toBeVisible();
  });

  it("puts a delete control inside each stored row, named by its file", () => {
    render(
      <DiveRecordingFiles
        recordings={[
          recording({
            files: [
              file({ uuid: "a", original_filename: "ocean.json" }),
              file({ uuid: "b", original_filename: "ocean.fit" }),
            ],
          }),
        ]}
        pending={[]}
        onRemovePending={vi.fn()}
        onDeleteStored={vi.fn()}
      />,
    );

    const rows = screen.getAllByTestId("dive-file-row");
    // Named by the file rather than by the verb. Two buttons both called
    // "Delete" are two controls a screen reader cannot tell apart, in a list
    // whose whole job is to say which file is which.
    expect(
      within(rows[0]).getByRole("button", { name: "Delete ocean.json" }),
    ).toBeVisible();
    expect(
      within(rows[1]).getByRole("button", { name: "Delete ocean.fit" }),
    ).toBeVisible();
  });

  it("offers no delete control on the create form, where nothing is stored", () => {
    // `onDeleteStored` is absent there. A row that offered one would be offering
    // to delete a file that does not exist yet.
    render(
      <DiveRecordingFiles
        recordings={[recording({ files: [file()] })]}
        pending={[]}
        onRemovePending={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /^Delete/ }),
    ).not.toBeInTheDocument();
  });

  it("gives a recording that kept no file a row saying so, and which kind of nothing it is", () => {
    // The Perdix, imported through the converter. Skipping it would leave a
    // device silently missing from a list a diver reads to check their files
    // are still there - which is what data loss looks like. The edit form is
    // the other surface reading `noFileKeptSentence`, so the sentence it picks
    // is pinned here as well as on the dive page's card.
    render(
      <DiveRecordingFiles
        recordings={[
          recording({
            device: { model: "Perdix 3", serial: "D9772626" },
            profile: {
              uuid: "p1",
              duration: 3163,
              depth_sample_count: 314,
              provenance: "divejson_import",
              channels: ["depth"],
            },
          }),
        ]}
        pending={[]}
        onRemovePending={vi.fn()}
        onDeleteStored={vi.fn()}
      />,
    );

    const [row] = screen.getAllByTestId("dive-file-row");
    expect(within(row).getByText(/Perdix 3 · D9772626/)).toBeVisible();
    expect(
      within(row).getByText(/no file kept — .*imported through the converter/i),
    ).toBeVisible();
    // Nothing to delete individually: the file-less recording is removed from
    // the dive page's Recordings card, not from a form's file list.
    expect(
      within(row).queryByRole("button", { name: /^Delete/ }),
    ).not.toBeInTheDocument();
  });

  it("lists pending files below the stored ones, and says they are not saved yet", () => {
    render(
      <DiveRecordingFiles
        recordings={[
          recording({ files: [file({ original_filename: "stored.fit" })] }),
        ]}
        pending={[pending({ file: new File(["x"], "picked.json") })]}
        onRemovePending={vi.fn()}
        onDeleteStored={vi.fn()}
      />,
    );

    const rows = screen.getAllByTestId("dive-file-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("stored.fit")).toBeVisible();
    expect(within(rows[1]).getByText("picked.json")).toBeVisible();
    expect(
      within(rows[1]).getByText(/will be attached when you save/i),
    ).toBeVisible();
  });

  it("removes a pending file locally, with no dialog in the way", () => {
    // Nothing is stored, so there is nothing to confirm - unpicking a file is
    // the diver correcting themselves, not a deletion.
    const onRemovePending = vi.fn();
    render(
      <DiveRecordingFiles
        recordings={[]}
        pending={[pending({ id: "p7" })]}
        onRemovePending={onRemovePending}
      />,
    );

    screen.getByRole("button", { name: /^Remove picked.fit/ }).click();
    expect(onRemovePending).toHaveBeenCalledWith("p7");
  });

  it("confirms before deleting a file that is already on the server", async () => {
    const onDeleteStored = vi.fn().mockResolvedValue(undefined);
    render(
      <DiveRecordingFiles
        recordings={[
          recording({
            files: [
              file({ uuid: "stored-uuid" }),
              file({ uuid: "f2", original_filename: "dive.json" }),
            ],
          }),
        ]}
        pending={[]}
        onRemovePending={vi.fn()}
        onDeleteStored={onDeleteStored}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Delete dive.fit" }),
    );
    expect(onDeleteStored).not.toHaveBeenCalled();

    // The dialog says what else goes with the file, because on this route that
    // is not obvious - the recording's profile is re-read from what is left.
    expect(
      screen.getByRole("heading", { name: "Delete this file?" }),
    ).toBeVisible();
    expect(screen.getByText(/re-read from the files it keeps/i)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDeleteStored).toHaveBeenCalledWith("stored-uuid");
  });

  it("says the recording goes too when this is its last file", async () => {
    // The deletion a diver cannot tell from the one above by looking at the
    // row: the same Trash icon on the last file removes the recording, promotes
    // whatever is next and rewrites the dive's readings. The title carries it,
    // because that is the line a confirmation is actually read at.
    render(
      <DiveRecordingFiles
        recordings={[recording({ files: [file({ uuid: "stored-uuid" })] })]}
        pending={[]}
        onRemovePending={vi.fn()}
        onDeleteStored={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Delete dive.fit" }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Delete this file and its recording?",
      }),
    ).toBeVisible();
    expect(screen.getByText(/the whole recording goes with it/i)).toBeVisible();
    expect(
      screen.getByText(/the figures the dive computer recorded are cleared/i),
    ).toBeVisible();
  });
});
