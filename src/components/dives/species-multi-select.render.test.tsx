import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpeciesMultiSelect } from "./species-multi-select";
import type { SightingWrite } from "@/lib/api/dives";
import type {
  Species,
  SpeciesSuggestion,
  SpeciesSuggestResponse,
  SpeciesSummary,
} from "@/lib/api/species";

// The first six cases mirror `dive-site-multi-select.render.test.tsx` - both
// fields wrap the same `CreatableCombobox`, and the rules about what counts as
// choosing an item were tightened for every append-only field at once. The rest
// cover the thing only this picker does: a pick that has to go to the API before
// it has a value at all.

const toast = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/species", () => ({
  MIN_SPECIES_QUERY_LENGTH: 2,
  MAX_SPECIES_QUERY_LENGTH: 255,
  speciesAPI: {
    suggestSpecies: vi.fn(),
    resolveSpecies: vi.fn(),
    getSpecies: vi.fn(),
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const { speciesAPI } = await import("@/lib/api/species");
const suggestSpecies = vi.mocked(speciesAPI.suggestSpecies);
const resolveSpecies = vi.mocked(speciesAPI.resolveSpecies);
const getSpecies = vi.mocked(speciesAPI.getSpecies);

// Already in the catalog, so picking it appends straight away.
const LOCAL: SpeciesSuggestion = {
  aphia_id: 105857,
  uuid: "species-manta",
  scientific_name: "Mobula birostris",
  common_name: "Giant manta ray",
  rank: "Species",
  status: "accepted",
  matched_name: null,
  source: "catalog",
  attribution:
    "[World Register of Marine Species](https://www.marinespecies.org) (CC BY)",
  dive_count_at_sites: 0,
  last_seen: null,
};

// Upstream only, so picking it has to resolve first.
const REMOTE: SpeciesSuggestion = {
  aphia_id: 278400,
  uuid: null,
  scientific_name: "Amphiprion ocellaris",
  common_name: "Ocellaris clownfish",
  rank: "Species",
  status: "accepted",
  matched_name: null,
  source: "wikidata",
  attribution: "Wikidata (CC0)",
  dive_count_at_sites: 0,
  last_seen: null,
};

const RESOLVED: Species = {
  uuid: "species-clownfish",
  aphia_id: 278400,
  scientific_name: "Amphiprion ocellaris",
  common_name: "Ocellaris clownfish",
  authority: "Cuvier, 1830",
  rank: "Species",
  status: "accepted",
  kingdom: "Animalia",
  phylum: "Chordata",
  class_name: "Teleostei",
  order_name: "Perciformes",
  family: "Pomacentridae",
  genus: "Amphiprion",
  is_marine: true,
  is_brackish: null,
  is_freshwater: null,
  wikidata_qid: "Q1126155",
  created_at: "2026-08-19T00:00:00Z",
  // The picker renders no photo, so what these say does not reach the assertions
  // below - they are here because `Species` mirrors a wire schema that always
  // carries them, and a fixture missing a field is a fixture that stops matching.
  photo_sha256: null,
  photo_file: null,
  photo_author: null,
  photo_license: null,
  photo_license_url: null,
  photo_source_url: null,
};

// The two above as the form hands them over, which is what lets a test seed a
// multi-row list without a lookup per row.
const MANTA_SUMMARY: SpeciesSummary = {
  uuid: "species-manta",
  scientific_name: "Mobula birostris",
  common_name: "Giant manta ray",
  rank: "Species",
};

const CLOWNFISH_SUMMARY: SpeciesSummary = {
  uuid: "species-clownfish",
  scientific_name: "Amphiprion ocellaris",
  common_name: "Ocellaris clownfish",
  rank: "Species",
};

const found = (
  results: SpeciesSuggestion[],
  has_more = false,
): SpeciesSuggestResponse => ({ results, has_more });

beforeEach(() => {
  toast.mockReset();
  suggestSpecies.mockReset();
  resolveSpecies.mockReset();
  getSpecies.mockReset();
  suggestSpecies.mockResolvedValue(found([LOCAL, REMOTE]));
});

// The last list the field handed back, so a test can assert what would be
// submitted rather than only what is on screen. Written from `onChange` rather
// than from the render, which would be a side effect during render - and would
// also stop telling "the field reported nothing" apart from "it reported the
// list it already had".
let submitted: SightingWrite[] = [];

function Field({
  initial = [] as SightingWrite[],
  known,
  sites,
}: {
  initial?: SightingWrite[];
  known?: SpeciesSummary[];
  sites?: string[];
}) {
  const [value, setValue] = useState<SightingWrite[]>(initial);
  return (
    <SpeciesMultiSelect
      value={value}
      knownSpecies={known}
      diveSiteUuids={sites}
      onChange={(next) => {
        submitted = next;
        setValue(next);
      }}
    />
  );
}

// Each row as it reads: a sighting by its header, a pending pick whole.
const rows = () =>
  Array.from(document.querySelectorAll("li")).map((li) =>
    (li.querySelector(":scope > div") ?? li).textContent?.trim(),
  );

const openMenu = async () => {
  await userEvent.click(screen.getByRole("combobox"));
  await waitFor(() =>
    expect(
      screen.getByRole("option", { name: /Giant manta ray/ }),
    ).toBeVisible(),
  );
};

describe("SpeciesMultiSelect", () => {
  beforeEach(() => {
    submitted = [];
  });

  it("adds a catalog species when its row is picked", async () => {
    render(<Field />);
    await openMenu();

    await userEvent.click(
      screen.getByRole("option", { name: /Giant manta ray/ }),
    );

    await waitFor(() =>
      expect(rows()).toEqual(["Giant manta ray Mobula birostris"]),
    );
    // The species alone: nothing counted and nothing written yet.
    expect(submitted).toEqual([{ species_uuid: "species-manta" }]);
    expect(resolveSpecies).not.toHaveBeenCalled();
  });

  it("adds a species on Enter", async () => {
    render(<Field />);
    await openMenu();

    await userEvent.paste("Giant manta ray");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(submitted).toEqual([{ species_uuid: "species-manta" }]),
    );
  });

  it("adds nothing from typing the name alone", async () => {
    // A name typed on the way to a longer one is not a choice, and this field's
    // `onChange` appends.
    render(<Field />);
    await openMenu();

    await userEvent.paste("Giant manta ray");
    await waitFor(() => expect(suggestSpecies).toHaveBeenCalled());

    expect(rows()).toEqual([]);
  });

  it("says it is searching while the list is loading, not that there is none", async () => {
    suggestSpecies.mockReturnValue(new Promise(() => {}));
    render(<Field />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Searching...")).toBeInTheDocument();
    expect(screen.queryByText("No species found.")).not.toBeInTheDocument();
  });

  it("says the search is down when the opening query fails", async () => {
    suggestSpecies.mockRejectedValue(new Error("500"));
    render(<Field />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(
      await screen.findByText("Search is unavailable right now."),
    ).toBeInTheDocument();
  });

  it("adds nothing on the way out of the field", async () => {
    render(
      <>
        <Field />
        <button type="button">Elsewhere</button>
      </>,
    );
    await openMenu();
    await userEvent.paste("Ocellaris clownfish");

    await userEvent.click(screen.getByRole("button", { name: "Elsewhere" }));

    expect(rows()).toEqual([]);
  });

  it("resolves an upstream pick and appends the uuid it comes back with", async () => {
    // The whole point of the resolve: what reaches form state is a real catalog
    // uuid, never the `aphia:` id the menu row was keyed by.
    resolveSpecies.mockResolvedValue(RESOLVED);
    render(<Field />);
    await openMenu();

    await userEvent.click(
      screen.getByRole("option", { name: /Ocellaris clownfish/ }),
    );

    await waitFor(() =>
      expect(submitted).toEqual([{ species_uuid: "species-clownfish" }]),
    );
    expect(resolveSpecies).toHaveBeenCalledWith(278400);
    expect(rows()).toEqual(["Ocellaris clownfish Amphiprion ocellaris"]);
  });

  it("shows a pending row while the resolve is in flight", async () => {
    let settle: (species: Species) => void = () => {};
    resolveSpecies.mockReturnValue(
      new Promise<Species>((resolve) => {
        settle = resolve;
      }),
    );
    render(<Field />);
    await openMenu();

    await userEvent.click(
      screen.getByRole("option", { name: /Ocellaris clownfish/ }),
    );

    // Named, so the diver can see which pick they are waiting on - and nothing
    // has reached form state yet.
    await waitFor(() => expect(rows()).toEqual(["Ocellaris clownfishAdding"]));
    expect(submitted).toEqual([]);

    settle(RESOLVED);
    await waitFor(() =>
      expect(submitted).toEqual([{ species_uuid: "species-clownfish" }]),
    );
  });

  it("reports a pick as pending until the resolve settles", async () => {
    // What stops a save from racing the resolve. Without it the loss is silent:
    // the dive is written without the sighting, and the resolve lands on a form
    // that has already navigated away.
    const onPendingChange = vi.fn();
    let settle: (species: Species) => void = () => {};
    resolveSpecies.mockReturnValue(
      new Promise<Species>((resolve) => {
        settle = resolve;
      }),
    );
    render(
      <SpeciesMultiSelect
        value={[]}
        onChange={() => {}}
        onPendingChange={onPendingChange}
      />,
    );
    await openMenu();
    expect(onPendingChange).toHaveBeenLastCalledWith(false);

    await userEvent.click(
      screen.getByRole("option", { name: /Ocellaris clownfish/ }),
    );
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(true));

    settle(RESOLVED);
    await waitFor(() =>
      expect(onPendingChange).toHaveBeenLastCalledWith(false),
    );
  });

  it("stops reporting pending when it unmounts mid-resolve", async () => {
    // The picker can now leave the page while a resolve is in flight: hiding
    // Species from the Fields dialog, or applying a preset that hides it, unmounts
    // it. Nothing else would ever report `false` again, so the card's submit button
    // stayed on "Adding species..." until a reload - a form wedged by a switch.
    const onPendingChange = vi.fn();
    resolveSpecies.mockReturnValue(new Promise(() => {}));
    const { unmount } = render(
      <SpeciesMultiSelect
        value={[]}
        onChange={() => {}}
        onPendingChange={onPendingChange}
      />,
    );
    await openMenu();

    await userEvent.click(
      screen.getByRole("option", { name: /Ocellaris clownfish/ }),
    );
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(true));

    unmount();

    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it("stops reporting pending when the resolve fails", async () => {
    // Otherwise a 503 would leave the form's submit button disabled for good.
    const onPendingChange = vi.fn();
    resolveSpecies.mockRejectedValue(new Error("503"));
    render(
      <SpeciesMultiSelect
        value={[]}
        onChange={() => {}}
        onPendingChange={onPendingChange}
      />,
    );
    await openMenu();

    await userEvent.click(
      screen.getByRole("option", { name: /Ocellaris clownfish/ }),
    );

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps a pending species out of the menu, so it can't be picked twice", async () => {
    resolveSpecies.mockReturnValue(new Promise(() => {}));
    render(<Field />);
    await openMenu();

    await userEvent.click(
      screen.getByRole("option", { name: /Ocellaris clownfish/ }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("option", { name: /Ocellaris clownfish/ }),
      ).not.toBeInTheDocument(),
    );
    expect(resolveSpecies).toHaveBeenCalledTimes(1);
  });

  it("toasts and leaves form state untouched when the resolve fails", async () => {
    resolveSpecies.mockRejectedValue(new Error("503"));
    render(<Field />);
    await openMenu();

    await userEvent.click(
      screen.getByRole("option", { name: /Ocellaris clownfish/ }),
    );

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toMatchObject({
      description: "Couldn't add that species.",
      variant: "destructive",
    });
    // The pending row goes too - a spinner that never stops is worse than the
    // pick simply not having happened.
    expect(rows()).toEqual([]);
    expect(submitted).toEqual([]);
  });

  it("keeps both of two resolves that land out of order", async () => {
    // The menu stays open after a pick, so a diver can start a second resolve
    // while the first is still going. `value` captured in the first closure is
    // the empty list, and appending to that would drop whichever landed first.
    const settlers: ((species: Species) => void)[] = [];
    resolveSpecies.mockImplementation(
      (aphiaId: number) =>
        new Promise<Species>((resolve) => {
          settlers.push((species) =>
            resolve({ ...species, aphia_id: aphiaId }),
          );
        }),
    );
    suggestSpecies.mockResolvedValue(
      found([REMOTE, { ...REMOTE, aphia_id: 127405, uuid: null }]),
    );
    render(<Field />);
    await userEvent.click(screen.getByRole("combobox"));
    await waitFor(() =>
      expect(
        screen.getAllByRole("option", { name: /Ocellaris clownfish/ }),
      ).toHaveLength(2),
    );

    await userEvent.click(
      screen.getAllByRole("option", { name: /Ocellaris clownfish/ })[0],
    );
    await waitFor(() => expect(settlers).toHaveLength(1));
    await userEvent.click(
      screen.getByRole("option", { name: /Ocellaris clownfish/ }),
    );
    await waitFor(() => expect(settlers).toHaveLength(2));

    settlers[1]({ ...RESOLVED, uuid: "species-second" });
    settlers[0]({ ...RESOLVED, uuid: "species-first" });

    await waitFor(() =>
      expect(submitted.map((sighting) => sighting.species_uuid).sort()).toEqual(
        ["species-first", "species-second"],
      ),
    );
  });

  it("credits the providers behind whatever the menu showed", async () => {
    render(<Field />);
    await openMenu();

    // The WoRMS credit arrives as a markdown link now, so the assertion is on
    // the anchor rather than on text: printing the string raw would put
    // `[World Register of Marine Species](https://...)` under the field, which
    // is a passing `getByText` and a broken credit line.
    const worms = screen.getByRole("link", {
      name: "World Register of Marine Species",
    });
    expect(worms).toHaveAttribute("href", "https://www.marinespecies.org");
    // The licence rides along as a plain run after the link, which is the half
    // `parseAttribution` would drop if it matched whole strings instead of
    // splitting them.
    expect(screen.getByText(/\(CC BY\)/)).toBeInTheDocument();
    expect(screen.getByText(/Wikidata \(CC0\)/)).toBeInTheDocument();
  });

  it("asks with the form's sites and held species, from the empty query on", async () => {
    render(
      <Field
        initial={[{ species_uuid: "species-turtle" }]}
        known={[
          {
            uuid: "species-turtle",
            scientific_name: "Chelonia mydas",
            common_name: "Green turtle",
            rank: "Species",
          },
        ]}
        sites={["site-a", "site-b"]}
      />,
    );
    await openMenu();

    expect(suggestSpecies).toHaveBeenCalledTimes(1);
    expect(suggestSpecies).toHaveBeenCalledWith("", {
      diveSiteUuids: ["site-a", "site-b"],
      excludeSpeciesUuids: ["species-turtle"],
    });
  });

  it("answers one typed letter with the rows that came back", async () => {
    // The diver's own species filter from the first letter. `minSearchLength`
    // still reads 2, but it only decides what an empty menu says.
    suggestSpecies.mockImplementation(async (query) =>
      found(query ? [LOCAL] : [LOCAL, REMOTE], query !== ""),
    );
    render(<Field />);
    await openMenu();

    await userEvent.keyboard("g");

    await waitFor(() =>
      expect(suggestSpecies).toHaveBeenLastCalledWith("g", {
        diveSiteUuids: undefined,
        excludeSpeciesUuids: [],
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("option", { name: /Ocellaris clownfish/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("option", { name: /Giant manta ray/ }),
    ).toBeVisible();
    // The one letter never reached the catalog search, which the API says.
    expect(
      screen.getByText("More matches than shown - keep typing to narrow."),
    ).toBeInTheDocument();
  });

  it("says why a row is near the top", async () => {
    suggestSpecies.mockResolvedValue(
      found([
        { ...LOCAL, dive_count_at_sites: 3, last_seen: "2026-03-12T09:00:00Z" },
        {
          ...REMOTE,
          uuid: "species-clownfish",
          source: "catalog",
          last_seen: "2026-03-12T09:00:00Z",
        },
      ]),
    );
    render(<Field sites={["site-a"]} />);
    await openMenu();

    expect(
      screen.getByRole("option", { name: /Giant manta ray/ }),
    ).toHaveTextContent("Mobula birostris · 3 dives here");
    expect(
      screen.getByRole("option", { name: /Ocellaris clownfish/ }),
    ).toHaveTextContent("Amphiprion ocellaris · last seen Mar 12, 2026");
  });

  it("asks again after a pick, without what was just picked", async () => {
    // The server leaves the held species out before it cuts the page, so the
    // refetch is what fills the slot the pick vacated. `excludeIds` would hide
    // the picked row either way; the call's arguments are what pin the refill.
    const NEXT: SpeciesSuggestion = {
      ...LOCAL,
      aphia_id: 137117,
      uuid: "species-turtle",
      scientific_name: "Chelonia mydas",
      common_name: "Green turtle",
    };
    suggestSpecies
      .mockResolvedValueOnce(found([LOCAL, REMOTE]))
      .mockResolvedValueOnce(found([REMOTE, NEXT]));
    render(<Field sites={["site-a"]} />);
    await openMenu();

    await userEvent.click(
      screen.getByRole("option", { name: /Giant manta ray/ }),
    );

    await waitFor(() => expect(suggestSpecies).toHaveBeenCalledTimes(2));
    expect(suggestSpecies).toHaveBeenLastCalledWith("", {
      diveSiteUuids: ["site-a"],
      excludeSpeciesUuids: ["species-manta"],
    });
    expect(
      await screen.findByRole("option", { name: /Green turtle/ }),
    ).toBeVisible();
  });

  it("labels a selection it was handed the names for without a lookup", async () => {
    render(
      <SpeciesMultiSelect
        value={[{ species_uuid: "species-manta" }]}
        knownSpecies={[MANTA_SUMMARY]}
        onChange={() => {}}
      />,
    );

    expect(rows()).toEqual(["Giant manta ray Mobula birostris"]);
    expect(getSpecies).not.toHaveBeenCalled();
  });

  it("fetches the name for a selection it was told nothing about", async () => {
    getSpecies.mockResolvedValue(RESOLVED);
    render(
      <SpeciesMultiSelect
        value={[{ species_uuid: "species-clownfish" }]}
        onChange={() => {}}
      />,
    );

    await waitFor(() =>
      expect(rows()).toEqual(["Ocellaris clownfish Amphiprion ocellaris"]),
    );
    expect(getSpecies).toHaveBeenCalledWith("species-clownfish");
  });

  it("names every per-row control after the species it acts on", async () => {
    // Two rows is the smallest list that can prove it: with one, "Remove" and
    // "Remove Giant manta ray" are equally unambiguous. The name is the display
    // name alone - the italic binomial beside it is not part of any label.
    render(
      <SpeciesMultiSelect
        value={[
          { species_uuid: "species-manta" },
          { species_uuid: "species-clownfish" },
        ]}
        knownSpecies={[MANTA_SUMMARY, CLOWNFISH_SUMMARY]}
        onChange={() => {}}
      />,
    );

    for (const name of ["Giant manta ray", "Ocellaris clownfish"]) {
      expect(
        screen.getByRole("button", { name: `Remove ${name}` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: `Count of ${name}` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("textbox", { name: `Notes on ${name}` }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", {
        name: /^Reorder Giant manta ray, position 1 of 2\./,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /^Reorder Ocellaris clownfish, position 2 of 2\./,
      }),
    ).toBeInTheDocument();
  });

  it("removes a species without touching the others", async () => {
    render(
      <Field
        initial={[
          { species_uuid: "species-manta", count: 2 },
          {
            species_uuid: "species-clownfish",
            count: 5,
            notes: "In the anemone",
          },
        ]}
        known={[MANTA_SUMMARY, CLOWNFISH_SUMMARY]}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Giant manta ray" }),
    );

    // The row that stays keeps what was typed on it.
    expect(submitted).toEqual([
      { species_uuid: "species-clownfish", count: 5, notes: "In the anemone" },
    ]);
  });
});

describe("SpeciesMultiSelect counts and notes", () => {
  beforeEach(() => {
    submitted = [];
  });

  const twoRows = (initial?: SightingWrite[]) =>
    render(
      <Field
        initial={
          initial ?? [
            { species_uuid: "species-manta" },
            { species_uuid: "species-clownfish" },
          ]
        }
        known={[MANTA_SUMMARY, CLOWNFISH_SUMMARY]}
      />,
    );

  const countOf = (name: string) =>
    screen.getByRole("textbox", { name: `Count of ${name}` });
  const notesOn = (name: string) =>
    screen.getByRole("textbox", { name: `Notes on ${name}` });

  it("puts a count typed on a row on that row's sighting", async () => {
    twoRows();

    await userEvent.type(countOf("Ocellaris clownfish"), "12");

    expect(submitted).toEqual([
      { species_uuid: "species-manta" },
      { species_uuid: "species-clownfish", count: 12 },
    ]);
    expect(countOf("Ocellaris clownfish")).toHaveValue("12");
  });

  it("sends no count once the box is emptied, rather than a 0 or a 1", async () => {
    twoRows([
      { species_uuid: "species-manta", count: 3 },
      { species_uuid: "species-clownfish" },
    ]);

    await userEvent.clear(countOf("Giant manta ray"));

    expect(submitted[0]).toEqual({ species_uuid: "species-manta" });
    expect("count" in submitted[0]).toBe(false);
    expect(countOf("Giant manta ray")).toHaveValue("");
  });

  it("takes a positive whole number and nothing else", async () => {
    // Refused keystrokes leave the box as it was, so it never holds a 0, a
    // fraction or anything but digits. The ceiling is the schema's to refuse.
    twoRows();
    const box = countOf("Giant manta ray");

    await userEvent.type(box, "0");
    expect(box).toHaveValue("");
    await userEvent.type(box, "-a.");
    expect(box).toHaveValue("");

    await userEvent.type(box, "2.5");
    expect(box).toHaveValue("25");
    expect(submitted[0]).toEqual({ species_uuid: "species-manta", count: 25 });
  });

  it("keeps the line breaks in a note, on that row's sighting", async () => {
    twoRows();

    await userEvent.type(
      notesOn("Giant manta ray"),
      "Cleaning station{Enter}at 18 m",
    );

    expect(submitted[0]).toEqual({
      species_uuid: "species-manta",
      notes: "Cleaning station\nat 18 m",
    });
    expect(submitted[1]).toEqual({ species_uuid: "species-clownfish" });
  });

  it("sends an empty note once the diver clears it", async () => {
    // What the dive's own notes field sends, and the API's spelling of none.
    twoRows([
      { species_uuid: "species-manta", notes: "Two juveniles" },
      { species_uuid: "species-clownfish" },
    ]);

    await userEvent.clear(notesOn("Giant manta ray"));

    expect(submitted[0]).toEqual({ species_uuid: "species-manta", notes: "" });
  });

  it("moves a row with its count and note when it is reordered", async () => {
    twoRows([
      { species_uuid: "species-manta", count: 2, notes: "Overhead" },
      { species_uuid: "species-clownfish" },
    ]);

    screen.getByRole("button", { name: /^Reorder Giant manta ray/ }).focus();
    await userEvent.keyboard("{ArrowDown}");

    expect(submitted).toEqual([
      { species_uuid: "species-clownfish" },
      { species_uuid: "species-manta", count: 2, notes: "Overhead" },
    ]);
  });

  it("shows neither input on a row still being resolved", async () => {
    // There is nothing in form state for them to write to yet.
    resolveSpecies.mockReturnValue(new Promise(() => {}));
    render(<Field />);
    await openMenu();

    await userEvent.click(
      screen.getByRole("option", { name: /Ocellaris clownfish/ }),
    );

    await waitFor(() => expect(rows()).toEqual(["Ocellaris clownfishAdding"]));
    expect(
      screen.queryByRole("textbox", { name: /Ocellaris clownfish/ }),
    ).not.toBeInTheDocument();
  });

  it("says under its row what the form refused, and marks that input", () => {
    render(
      <SpeciesMultiSelect
        value={[
          { species_uuid: "species-manta" },
          { species_uuid: "species-clownfish", count: 3_000_000_000 },
        ]}
        knownSpecies={[MANTA_SUMMARY, CLOWNFISH_SUMMARY]}
        onChange={() => {}}
        errors={[undefined, { count: "That's more than a count can hold" }]}
      />,
    );

    const box = screen.getByRole("textbox", {
      name: "Count of Ocellaris clownfish",
    });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription(
      "That's more than a count can hold",
    );
    expect(
      screen.getByRole("textbox", { name: "Count of Giant manta ray" }),
    ).not.toHaveAttribute("aria-invalid");
  });
});
