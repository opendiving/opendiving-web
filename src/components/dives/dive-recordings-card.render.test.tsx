import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveRecordingsCard } from "./dive-recordings-card";
import type {
  Dive,
  DiveFileInfo,
  DiveProfileInfo,
  Recording,
} from "@/lib/api/dives";

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

function profileInfo(
  overrides: Partial<DiveProfileInfo> = {},
): DiveProfileInfo {
  return {
    uuid: "p1",
    duration: 3163,
    depth_sample_count: 314,
    provenance: "file",
    channels: ["depth"],
    ...overrides,
  };
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

  it("tells the two kinds of file-less recording apart on the profile's provenance", () => {
    // The dive after the walk's merge, read back from the API: the Perdix's two
    // halves folded into one recording, and beside it the converter-imported one
    // from the same logbook import. Both have an empty `files`, so the sentences
    // can only come from the provenance - and a diver reading the card to find
    // out what became of their upload gets a different answer for each.
    render(
      <DiveRecordingsCard
        dive={dive({
          recordings: [
            recording({
              uuid: "merged",
              ordinal: 0,
              device: { model: "Perdix 3", serial: "D9772626" },
              profile: profileInfo({ uuid: "p1", provenance: "merge" }),
            }),
            recording({
              uuid: "imported",
              ordinal: 1,
              device: { brand: "Suunto", model: "Suunto Ocean" },
              profile: profileInfo({
                uuid: "p2",
                provenance: "divejson_import",
              }),
            }),
          ],
        })}
        onChanged={vi.fn()}
      />,
    );

    const [merged, imported] = screen.getAllByTestId("dive-recording");
    expect(
      within(merged).getByText(/merged from two recordings/i),
    ).toBeVisible();
    expect(
      within(imported).getByText(/imported through the converter/i),
    ).toBeVisible();
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

  it("distinguishes the file deletion the recording survives from the one it does not", async () => {
    // The Suunto that exported one dive twice, beside a second computer. The
    // same Trash icon on the FIT and then on the JSON does two different things
    // - the second takes the recording, the primary slot and the dive's
    // readings with it - and nothing in the row says which.
    const suunto = recording({
      uuid: "a",
      ordinal: 0,
      files: [
        file({ uuid: "sj", original_filename: "ocean.json" }),
        file({ uuid: "sf", original_filename: "ocean.fit" }),
      ],
    });
    const perdix = recording({
      uuid: "b",
      ordinal: 1,
      files: [file({ uuid: "pf", original_filename: "perdix.uddf" })],
    });

    const { rerender } = render(
      <DiveRecordingsCard
        dive={dive({ recordings: [suunto, perdix] })}
        onChanged={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Delete ocean.fit" }),
    );
    expect(
      screen.getByRole("heading", { name: "Delete this file?" }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    rerender(
      <DiveRecordingsCard
        dive={dive({
          recordings: [{ ...suunto, files: [suunto.files[0]] }, perdix],
        })}
        onChanged={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Delete ocean.json" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "Delete this file and its recording?",
      }),
    ).toBeVisible();
    expect(screen.getByText(/the next one takes over/i)).toBeVisible();
  });

  it("says what a whole-recording delete moves, rather than that the dive is unaffected", async () => {
    // The dive row survives, which is the only sense in which it is unaffected:
    // this recording is the one shown by default, so the dive's readings follow
    // whatever takes its place.
    render(
      <DiveRecordingsCard
        dive={dive({
          recordings: [
            recording({
              uuid: "a",
              ordinal: 0,
              profile: profileInfo({ provenance: "merge" }),
            }),
            recording({
              uuid: "b",
              ordinal: 1,
              files: [file({ uuid: "pf" })],
            }),
          ],
        })}
        onChanged={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /delete recording/i }),
    );

    expect(screen.getByText(/the next one takes over/i)).toBeVisible();
    expect(screen.getByText(/The dive itself stays/i)).toBeVisible();
  });
});

describe("DiveRecordingsCard settings line", () => {
  it("says what each computer was set to, per recording", () => {
    // **Per recording, never per dive.** A backup run in gauge mode beside a
    // primary on open circuit is ordinary practice, and this card is the one
    // place that can say both without claiming either of the dive.
    render(
      <DiveRecordingsCard
        dive={dive({
          recordings: [
            recording({
              uuid: "perdix",
              ordinal: 0,
              files: [file()],
              device: { brand: "Shearwater", model: "Perdix 3" },
              mode: "closed_circuit",
              deco_model: {
                algorithm: "buhlmann",
                gf_low: 30,
                gf_high: 85,
              },
            }),
            recording({
              uuid: "ocean",
              ordinal: 1,
              files: [file({ uuid: "f2" })],
              device: { brand: "Suunto", model: "Suunto Ocean" },
              mode: "gauge",
            }),
          ],
        })}
        onChanged={vi.fn()}
      />,
    );

    const [primary, backup] = screen.getAllByTestId("dive-recording");
    expect(
      within(primary).getByTestId("dive-recording-settings"),
    ).toHaveTextContent("Closed circuit · Bühlmann GF 30/85");
    expect(
      within(backup).getByTestId("dive-recording-settings"),
    ).toHaveTextContent("Gauge");
  });

  it("leaves the line out where the file recorded neither", () => {
    // Rather than printing "Open circuit" on a file that never said so - an
    // absent mode is not open circuit, however a source format's documentation
    // glosses its own default.
    render(
      <DiveRecordingsCard
        dive={dive({
          recordings: [recording({ files: [file()] })],
        })}
        onChanged={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("dive-recording-settings")).toBeNull();
  });
});
