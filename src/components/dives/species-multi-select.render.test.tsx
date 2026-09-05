import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpeciesMultiSelect } from "./species-multi-select";
import type {
  Species,
  SpeciesSearchResponse,
  SpeciesSearchResult,
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
    searchSpecies: vi.fn(),
    resolveSpecies: vi.fn(),
    getSpecies: vi.fn(),
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const { speciesAPI } = await import("@/lib/api/species");
const searchSpecies = vi.mocked(speciesAPI.searchSpecies);
const resolveSpecies = vi.mocked(speciesAPI.resolveSpecies);
const getSpecies = vi.mocked(speciesAPI.getSpecies);

// Already in the catalog, so picking it appends straight away.
const LOCAL: SpeciesSearchResult = {
  aphia_id: 105857,
  uuid: "species-manta",
  scientific_name: "Mobula birostris",
  common_name: "Giant manta ray",
  rank: "Species",
  status: "accepted",
  matched_name: null,
  source: "catalog",
  attribution: "World Register of Marine Species (marinespecies.org)",
};

// Upstream only, so picking it has to resolve first.
const REMOTE: SpeciesSearchResult = {
  aphia_id: 278400,
  uuid: null,
  scientific_name: "Amphiprion ocellaris",
  common_name: "Ocellaris clownfish",
  rank: "Species",
  status: "accepted",
  matched_name: null,
  source: "wikidata",
  attribution: "Wikidata (CC0)",
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
  results: SpeciesSearchResult[],
  has_more = false,
): SpeciesSearchResponse => ({ results, has_more });

beforeEach(() => {
  toast.mockReset();
  searchSpecies.mockReset();
  resolveSpecies.mockReset();
  getSpecies.mockReset();
  searchSpecies.mockResolvedValue(found([LOCAL, REMOTE]));
});

// The last list the field handed back, so a test can assert what would be
// submitted rather than only what is on screen. Written from `onChange` rather
// than from the render, which would be a side effect during render - and would
// also stop telling "the field reported nothing" apart from "it reported the
// list it already had".
let submitted: string[] = [];

function Field({
  initial = [] as string[],
  known,
}: {
  initial?: string[];
  known?: SpeciesSummary[];
}) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <SpeciesMultiSelect
      value={value}
      knownSpecies={known}
      onChange={(next) => {
        submitted = next;
        setValue(next);
      }}
    />
  );
}

const rows = () =>
  Array.from(document.querySelectorAll("li")).map((li) =>
    li.textContent?.trim(),
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
    expect(submitted).toEqual(["species-manta"]);
    expect(resolveSpecies).not.toHaveBeenCalled();
  });

  it("adds a species on Enter", async () => {
    render(<Field />);
    await openMenu();

    await userEvent.paste("Giant manta ray");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(submitted).toEqual(["species-manta"]));
  });

  it("adds nothing from typing the name alone", async () => {
    // A name typed on the way to a longer one is not a choice, and this field's
    // `onChange` appends.
    render(<Field />);
    await openMenu();

    await userEvent.paste("Giant manta ray");
    await waitFor(() => expect(searchSpecies).toHaveBeenCalled());

    expect(rows()).toEqual([]);
  });

  it("says it is searching while the list is loading, not that there is none", async () => {
    searchSpecies.mockReturnValue(new Promise(() => {}));
    render(<Field />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Searching...")).toBeInTheDocument();
    expect(screen.queryByText("No species found.")).not.toBeInTheDocument();
  });

  it("says the search is down when the opening query fails", async () => {
    searchSpecies.mockRejectedValue(new Error("500"));
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

    await waitFor(() => expect(submitted).toEqual(["species-clownfish"]));
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
    await waitFor(() => expect(submitted).toEqual(["species-clownfish"]));
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
    // stayed on "Adding species..." until a reload - a form wedged by a checkbox.
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
    searchSpecies.mockResolvedValue(
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
      expect([...submitted].sort()).toEqual([
        "species-first",
        "species-second",
      ]),
    );
  });

  it("credits the providers behind whatever the menu showed", async () => {
    render(<Field />);
    await openMenu();

    expect(
      screen.getByText(/World Register of Marine Species/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Wikidata \(CC0\)/)).toBeInTheDocument();
  });

  it("labels a selection it was handed the names for without a lookup", async () => {
    render(
      <SpeciesMultiSelect
        value={["species-manta"]}
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
      <SpeciesMultiSelect value={["species-clownfish"]} onChange={() => {}} />,
    );

    await waitFor(() =>
      expect(rows()).toEqual(["Ocellaris clownfish Amphiprion ocellaris"]),
    );
    expect(getSpecies).toHaveBeenCalledWith("species-clownfish");
  });

  it("names both per-row controls after the species they act on", async () => {
    // Two rows is the smallest list that can prove it: with one, "Remove" and
    // "Remove Giant manta ray" are equally unambiguous. The name is the display
    // name alone - the italic binomial beside it is not part of either label.
    render(
      <SpeciesMultiSelect
        value={["species-manta", "species-clownfish"]}
        knownSpecies={[MANTA_SUMMARY, CLOWNFISH_SUMMARY]}
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Remove Giant manta ray" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Ocellaris clownfish" }),
    ).toBeInTheDocument();
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
        initial={["species-manta", "species-clownfish"]}
        known={[MANTA_SUMMARY, CLOWNFISH_SUMMARY]}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Giant manta ray" }),
    );

    expect(submitted).toEqual(["species-clownfish"]);
  });
});
