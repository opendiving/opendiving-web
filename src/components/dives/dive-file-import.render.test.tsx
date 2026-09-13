import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { DiveFileImport } from "./dive-file-import";
import type { PendingDiveFile } from "./dive-recording-files";
import { DEFAULT_MIXTURE } from "./mixture-fields";
import type { DiveFormValues } from "./dive-form-fields";
import type { ParsedDive, ParsedDiveMixture } from "@/lib/api/dives";

// The sentence itself is unit-tested in `lib/dive-import.test.ts`. What only a render can
// reach is the wiring: that the `role="status"` region exists *before* the note does, so
// the note is announced when it arrives rather than landing in a region the screen reader
// has not registered yet.

vi.mock("@/lib/api/dives", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dives")>()),
  divesAPI: {
    parseDiveFile: vi.fn(),
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// The component pushes a route when the diver accepts a match against another
// dive. Nothing in this file exercises that path, but `useRouter` throws
// outright without a mounted app router, so the hook has to resolve to
// something for the component to render at all.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const { divesAPI } = await import("@/lib/api/dives");

// Typed rather than `unknown[]` + `as never`: a field added to `ParsedDive` should break
// this fixture, which is the coupling the sibling suites already enforce.
function parsedDive(
  mixtures: ParsedDiveMixture[],
  overrides: Partial<ParsedDive> = {},
): ParsedDive {
  return {
    dive_number: null,
    start_time: null,
    duration: null,
    max_depth: null,
    avg_depth: null,
    bottom_temperature: null,
    water_type: null,
    mixtures,
    // Returned by the parse but never applied to the form - the API writes these
    // itself when the file is attached. Spelled out so this fixture stays a complete
    // `ParsedDive` rather than a partial one the compiler happens to accept.
    cns_start: null,
    cns_end: null,
    otu_start: null,
    otu_end: null,
    surface_pressure_bar: null,
    file_token: "token",
    ...overrides,
  };
}

// Mirrors the create page: the form is seeded with one complete cylinder before any
// import happens, which is what an import actually meets.
function Harness({
  onFileAdded,
}: {
  onFileAdded?: (pending: PendingDiveFile) => void;
} = {}) {
  const form = useForm<DiveFormValues>({
    defaultValues: {
      mixtures: [{ ...DEFAULT_MIXTURE }],
    },
  });
  return (
    <>
      <DiveFileImport
        form={form}
        onFileAdded={onFileAdded}
        replaceMixtures={(mixtures) =>
          form.setValue("mixtures", mixtures, { shouldDirty: true })
        }
      />
      {/* Stands in for the depth box on the real form, so a second file's
          fill-only write can be told from an overwrite. */}
      <label>
        Max depth
        <input
          type="number"
          {...form.register("max_depth", { valueAsNumber: true })}
        />
      </label>
      {/* Stands in for `MixtureFields`' volume input, so the test can edit the value
          the note is about through the same form the component watches. */}
      <label>
        Volume
        <input
          type="number"
          {...form.register("mixtures.0.volume", { valueAsNumber: true })}
        />
      </label>
    </>
  );
}

function fileInput() {
  // The real input is `hidden` and driven by a button click, so `userEvent.upload`
  // refuses it - `fireEvent.change` is what that click ultimately produces.
  return document.querySelector<HTMLInputElement>('input[type="file"]')!;
}

function importFiles(...names: string[]) {
  fireEvent.change(fileInput(), {
    target: {
      files: names.map(
        (name) => new File(["{}"], name, { type: "application/octet-stream" }),
      ),
    },
  });
}

function importFile() {
  importFiles("dive.fit");
}

describe("DiveFileImport", () => {
  beforeEach(() => {
    vi.mocked(divesAPI.parseDiveFile).mockReset();
  });

  it("lets the diver pick every file of one dive in one go", () => {
    render(<Harness />);

    // A dive off two computers, or one computer's JSON beside its FIT, is the
    // case the list on this card already exists for. Without this the picker
    // made it two trips.
    expect(fileInput()).toHaveAttribute("multiple");
  });

  it("parses picked files in order, and only the first one overwrites", async () => {
    // First-file-wins has to survive a batch, where none of the state saying
    // "a file is already here" has re-rendered yet. The second file's deeper
    // max depth is what a last-file-wins bug would leave on the form.
    vi.mocked(divesAPI.parseDiveFile)
      .mockResolvedValueOnce(parsedDive([], { max_depth: 30.1 }))
      .mockResolvedValueOnce(parsedDive([], { max_depth: 41.7 }));
    const onFileAdded = vi.fn();

    render(<Harness onFileAdded={onFileAdded} />);
    importFiles("ocean.fit", "ocean.json");

    await waitFor(() => expect(onFileAdded).toHaveBeenCalledTimes(2));
    expect(onFileAdded.mock.calls.map(([item]) => item.file.name)).toEqual([
      "ocean.fit",
      "ocean.json",
    ]);
    expect(screen.getByLabelText("Max depth")).toHaveValue(30.1);
  });

  it("keeps going through the rest of a batch when one file will not parse", async () => {
    // The diver picked them together and has no way to re-pick "the other
    // two", so a single bad export cannot take the batch down with it.
    vi.mocked(divesAPI.parseDiveFile)
      .mockRejectedValueOnce(new Error("unreadable"))
      .mockResolvedValueOnce(parsedDive([], { max_depth: 22.4 }));
    const onFileAdded = vi.fn();

    render(<Harness onFileAdded={onFileAdded} />);
    importFiles("broken.fit", "ocean.json");

    await waitFor(() => expect(onFileAdded).toHaveBeenCalledTimes(1));
    expect(onFileAdded.mock.calls[0][0].file.name).toBe("ocean.json");
    // And the one that did parse prefills, since nothing before it landed.
    expect(screen.getByLabelText("Max depth")).toHaveValue(22.4);
  });

  it("keeps a live region mounted before any import", () => {
    render(<Harness />);

    // Mounted and empty. One that appears together with its text is typically not
    // announced at all - screen readers register the region on insertion and read
    // subsequent changes.
    const region = document.querySelector('[role="status"]');
    expect(region).not.toBeNull();
    expect(region).toHaveTextContent("");
  });

  it("announces the note when it arrives, in a region that was already there", async () => {
    vi.mocked(divesAPI.parseDiveFile).mockResolvedValue(
      parsedDive([
        {
          volume: null,
          start_pressure: null,
          end_pressure: null,
          oxygen: 32,
          helium: 0,
          po2_limit: null,
          gas_number: null,
          role: null,
        },
      ]),
    );
    render(<Harness />);

    const region = document.querySelector('[role="status"]')!;
    expect(region).toHaveTextContent("");

    importFile();

    await waitFor(() => expect(region).toHaveTextContent("cylinder size"));
    // No figure in it. The gas fields are ~2 200 px below this card, so a quoted value
    // could never be compared with the one in the box - and quoting one is what forced
    // the sentence to track the form.
    expect(region.textContent).not.toMatch(/\d/);
  });

  it("leaves the note alone when the diver edits the field it names", async () => {
    // The note is a statement about the file, and stays true. Rewriting it as the diver
    // types - two viewports away from this card, where they cannot see it change - was
    // machinery serving an interaction nobody observes.
    vi.mocked(divesAPI.parseDiveFile).mockResolvedValue(
      parsedDive([
        {
          volume: null,
          start_pressure: null,
          end_pressure: null,
          oxygen: 32,
          helium: 0,
          po2_limit: null,
          gas_number: null,
          role: null,
        },
      ]),
    );
    render(<Harness />);
    importFile();

    const region = document.querySelector('[role="status"]')!;
    await waitFor(() => expect(region).toHaveTextContent("cylinder size"));
    const announced = region.textContent;

    const volume = screen.getByLabelText("Volume");
    await userEvent.clear(volume);
    await userEvent.type(volume, "15");

    expect(region.textContent).toBe(announced);
  });
});
