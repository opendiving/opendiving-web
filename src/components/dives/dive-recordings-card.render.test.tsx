import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveRecordingsCard } from "./dive-recordings-card";
import type { Dive, DiveFileInfo, Recording } from "@/lib/api/dives";

// What this card has to get right is a set of claims about the account's
// contents: which computers recorded the dive, which files are still held for
// each, and which recording the dive's own figures come from. Every one of those
// is checkable in the DOM. How the blocks stack at 375px is not - jsdom returns
// zero-sized rects - and is measured in a browser instead.

vi.mock("@/lib/api/dives", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dives")>()),
  divesAPI: {
    getDiveFileBlob: vi.fn(),
    deleteDiveFile: vi.fn(),
    deleteRecording: vi.fn(),
    makeRecordingPrimary: vi.fn(),
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const { divesAPI } = await import("@/lib/api/dives");

function file(overrides: Partial<DiveFileInfo> = {}): DiveFileInfo {
  return {
    uuid: "f1",
    original_filename: "ocean.fit",
    content_type: "application/octet-stream",
    byte_size: 4096,
    parser_key: "fit",
    ...overrides,
  };
}

function recording(overrides: Partial<Recording> = {}): Recording {
  return { uuid: "r1", ordinal: 0, files: [], ...overrides };
}

function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "d1",
    dive_number: 2,
    start_time: "2026-09-08T15:18:10",
    duration: 3163,
    dive_sites: [],
    gear_items: [],
    notes: "",
    user_uuid: "u1",
    created_at: "2026-09-08T13:18:10Z",
    mixtures: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DiveRecordingsCard", () => {
  it("renders nothing for a dive logged by hand", () => {
    // Most dives are. There is no empty state worth showing for a thing the
    // diver deliberately did not do.
    const { container } = render(
      <DiveRecordingsCard dive={dive()} onChanged={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("gives each recording a block naming its device", () => {
    render(
      <DiveRecordingsCard
        dive={dive({
          recordings: [
            recording({
              uuid: "perdix",
              ordinal: 0,
              device: {
                brand: "Shearwater Research, Inc",
                model: "Perdix 3",
                serial: "D9772626",
                name: "Perdix 3",
              },
            }),
            recording({
              uuid: "ocean",
              ordinal: 1,
              device: {
                brand: "Suunto",
                serial: "253810000400",
                name: "Porvoo",
              },
              files: [file()],
            }),
          ],
        })}
        onChanged={vi.fn()}
      />,
    );

    const blocks = screen.getAllByTestId("dive-recording");
    expect(blocks).toHaveLength(2);
    expect(
      within(blocks[0]).getByText(
        "Shearwater Research, Inc Perdix 3 · D9772626",
      ),
    ).toBeVisible();
    expect(
      within(blocks[1]).getByText("Suunto · 253810000400 (Porvoo)"),
    ).toBeVisible();
  });

  it("says a file-less recording kept nothing, rather than showing an empty block", () => {
    render(
      <DiveRecordingsCard
        dive={dive({
          recordings: [recording({ device: { model: "Perdix 3" } })],
        })}
        onChanged={vi.fn()}
      />,
    );

    const [block] = screen.getAllByTestId("dive-recording");
    expect(within(block).getByText(/no file kept/i)).toBeVisible();
    expect(
      within(block).queryByTestId("dive-recording-file"),
    ).not.toBeInTheDocument();
  });

  it("offers a whole-recording delete only where there are no files to delete one by one", () => {
    // A recording with no files is unreachable through the per-file route, so
    // without this a converter-imported or merged one would be permanent. Where
    // there *are* files, deleting them is the smaller action and the server
    // removes the recording with the last of them.
    const { rerender } = render(
      <DiveRecordingsCard
        dive={dive({ recordings: [recording()] })}
        onChanged={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /delete recording/i }),
    ).toBeVisible();

    rerender(
      <DiveRecordingsCard
        dive={dive({ recordings: [recording({ files: [file()] })] })}
        onChanged={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /delete recording/i }),
    ).not.toBeInTheDocument();
  });

  it("offers 'Show by default' on every recording but the first", () => {
    // *Something* has to be primary, so "make this one not primary" is not an
    // operation - the API refuses it with a 422. A diver who means that is
    // promoting a different recording.
    render(
      <DiveRecordingsCard
        dive={dive({
          recordings: [
            recording({ uuid: "a", ordinal: 0, files: [file({ uuid: "fa" })] }),
            recording({ uuid: "b", ordinal: 1, files: [file({ uuid: "fb" })] }),
          ],
        })}
        onChanged={vi.fn()}
      />,
    );

    const blocks = screen.getAllByTestId("dive-recording");
    expect(
      within(blocks[0]).queryByRole("button", { name: /show by default/i }),
    ).not.toBeInTheDocument();
    expect(
      within(blocks[1]).getByRole("button", { name: /show by default/i }),
    ).toBeVisible();
  });

  it("promotes a recording and re-reads the dive rather than predicting the result", async () => {
    // Promotion re-derives the dive's oxygen-exposure readings server-side, so
    // what the page shows afterwards has to come from the server.
    vi.mocked(divesAPI.makeRecordingPrimary).mockResolvedValue(recording());
    const onChanged = vi.fn();

    render(
      <DiveRecordingsCard
        dive={dive({
          recordings: [
            recording({ uuid: "a", ordinal: 0, files: [file({ uuid: "fa" })] }),
            recording({ uuid: "b", ordinal: 1, files: [file({ uuid: "fb" })] }),
          ],
        })}
        onChanged={onChanged}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /show by default/i }),
    );

    expect(divesAPI.makeRecordingPrimary).toHaveBeenCalledWith("d1", "b");
    expect(onChanged).toHaveBeenCalled();
  });

  it("names the recording's own start only when it differs from the dive's", () => {
    // A second computer that entered the water a minute later is worth a line.
    // The primary agreeing with the dive is not, and a line repeating the
    // header's own time would be noise on every imported dive.
    const { rerender } = render(
      <DiveRecordingsCard
        dive={dive({
          recordings: [
            recording({ started_at: "2026-09-08T15:18:10", files: [file()] }),
          ],
        })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.queryByText(/^Started /)).not.toBeInTheDocument();

    rerender(
      <DiveRecordingsCard
        dive={dive({
          recordings: [
            recording({ started_at: "2026-09-08T15:21:53", files: [file()] }),
          ],
        })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText(/^Started /)).toBeVisible();
  });

  it("asks the file route for the file, not the dive", async () => {
    // The old route took the dive alone because a dive had one file. A dive now
    // has several across its recordings, so the uuid in the path is the file's.
    vi.mocked(divesAPI.deleteDiveFile).mockResolvedValue(undefined);

    render(
      <DiveRecordingsCard
        dive={dive({
          recordings: [recording({ files: [file({ uuid: "file-uuid" })] })],
        })}
        onChanged={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Delete ocean.fit" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(divesAPI.deleteDiveFile).toHaveBeenCalledWith("d1", "file-uuid");
  });
});
