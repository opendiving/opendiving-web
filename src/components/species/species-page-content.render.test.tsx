import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { SpeciesLifeListEntry } from "@/lib/api/species";
import { SpeciesPageContent } from "./species-page-content";

// One object for every render, so a guard read in an effect's dependencies does
// not refetch the list on each one.
const stable = vi.hoisted(() => ({
  guard: { user: { uuid: "user-1" }, isAuthenticated: true, isLoading: false },
}));

vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => stable.guard,
}));

vi.mock("@/lib/api/species", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/species")>();
  return {
    ...actual,
    speciesAPI: { ...actual.speciesAPI, getLifeList: vi.fn() },
  };
});

const { speciesAPI } = await import("@/lib/api/species");

const MANTA: SpeciesLifeListEntry = {
  uuid: "sp-1",
  common_name: "Giant manta ray",
  scientific_name: "Mobula birostris",
  rank: "Species",
  photo_sha256: null,
  dive_count: 7,
  dive_site_count: 3,
  first_seen: "2024-03-02T09:00:00+07:00",
  last_seen: "2026-09-14T09:00:00+09:00",
};

describe("SpeciesPageContent", () => {
  it("gives each species the species page's figures, and no first sighting", async () => {
    vi.mocked(speciesAPI.getLifeList).mockResolvedValue({
      data: [MANTA],
      total_count: 1,
      has_more: false,
      page: 1,
      items_per_page: 24,
    });
    render(<SpeciesPageContent />);

    const card = within(
      (await screen.findByRole("link", { name: "Giant manta ray" })).closest(
        "li",
      )!,
    );
    const figure = (label: string) =>
      card.getByText(label, { selector: "dt" }).nextElementSibling;
    expect(card.getAllByRole("term").map((term) => term.textContent)).toEqual([
      "Dives",
      "Dive sites",
      "Last seen",
    ]);
    expect(figure("Dives")).toHaveTextContent("7");
    expect(figure("Dive sites")).toHaveTextContent("3");
    expect(figure("Last seen")).toHaveTextContent("Sep 14, 2026");
    expect(card.queryByText(/Mar 2, 2024/)).not.toBeInTheDocument();
  });
});
