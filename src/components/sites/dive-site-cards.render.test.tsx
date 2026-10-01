import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

import type { DiveSite } from "@/lib/api/dive-sites";
import type { SpeciesLifeListEntry } from "@/lib/api/species";
import { DiveSiteInfoCard } from "./dive-site-info-card";
import { DiveSiteHero } from "./dive-site-hero";
import { DiveSiteSpeciesCard } from "./dive-site-species-card";

// What the site page says about the site itself: what it records, what the
// diver's dives there add up to in its hero, and the species seen on them.

const account = vi.hoisted(() => ({
  user: { uuid: "user-1", units: "metric" as "metric" | "imperial" },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => account,
}));

vi.mock("@/lib/api/species", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/species")>();
  return {
    ...actual,
    speciesAPI: { ...actual.speciesAPI, getLifeList: vi.fn() },
  };
});

// The map is covered where it lives; here it is what the hero hands it.
vi.mock("@/components/map/locations-map-lazy", () => ({
  LocationsMap: vi.fn(() => null),
}));

const { speciesAPI } = await import("@/lib/api/species");
const { LocationsMap } = await import("@/components/map/locations-map-lazy");

const SITE: DiveSite = {
  uuid: "site-1",
  name: "Sunabe Seawall",
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00Z",
};

const row = (label: string) =>
  screen.getByText(label, { selector: "div" }).nextElementSibling;

beforeEach(() => {
  account.user.units = "metric";
  vi.mocked(speciesAPI.getLifeList).mockReset();
  vi.mocked(LocationsMap).mockClear();
});

describe("DiveSiteInfoCard", () => {
  it("shows every member the site has", () => {
    render(
      <DiveSiteInfoCard
        site={{
          ...SITE,
          other_names: ["砂辺", "Sunabe"],
          depth_from: 3,
          depth_to: 18,
          water_type: "salt",
          altitude: 2,
          entry_types: ["shore", "pier"],
          tags: ["shore dive", "macro"],
          external_ids: [
            { registry: "openstreetmap", identifier: "node/313862678" },
            { registry: "wikidata", identifier: "Q11520018" },
            { registry: "wrecksite", identifier: "10021" },
          ],
        }}
      />,
    );

    expect(row("Also known as")).toHaveTextContent("砂辺, Sunabe");
    expect(row("Depth")).toHaveTextContent("3 m – 18 m");
    expect(row("Water type")).toHaveTextContent("Salt water");
    expect(row("Altitude")).toHaveTextContent("2 m");
    expect(row("Entry types")).toHaveTextContent("Shore, Pier");
    expect(
      within(row("Tags") as HTMLElement)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["shore dive", "macro"]);

    const registries = within(row("In other registries") as HTMLElement);
    expect(
      registries.getByRole("link", { name: /OpenStreetMap node\/313862678/ }),
    ).toHaveAttribute("href", "https://www.openstreetmap.org/node/313862678");
    expect(
      registries.getByRole("link", { name: /Wikidata Q11520018/ }),
    ).toHaveAttribute("href", "https://www.wikidata.org/wiki/Q11520018");
    // A registry the format names no form for is text, not a guess at a URL.
    expect(registries.getByText(/wrecksite/).closest("a")).toBeNull();
  });

  it("shows nothing for a member the site lacks", () => {
    render(<DiveSiteInfoCard site={SITE} />);

    for (const label of [
      "Also known as",
      "Depth",
      "Water type",
      "Altitude",
      "Entry type",
      "Tags",
      "In other registries",
    ]) {
      expect(
        screen.queryByText(label, { selector: "div" }),
      ).not.toBeInTheDocument();
    }
  });

  it("says one end of a range where only one is recorded", () => {
    render(<DiveSiteInfoCard site={{ ...SITE, depth_to: 40 }} />);

    expect(row("Depth")).toHaveTextContent("To 40 m");
  });

  it("reads depths and the altitude in the diver's units", () => {
    account.user.units = "imperial";
    render(
      <DiveSiteInfoCard
        site={{ ...SITE, depth_from: 4.57, depth_to: 30.48, altitude: 1829 }}
      />,
    );

    expect(row("Depth")).toHaveTextContent("15 ft – 100 ft");
    expect(row("Altitude")).toHaveTextContent("6001 ft");
  });
});

describe("DiveSiteHero", () => {
  const figure = (label: string) =>
    screen.getByText(label, { selector: "dt" }).nextElementSibling;

  it("heads the page with the site's name and place over every figure its dives add up to", () => {
    render(
      <DiveSiteHero
        site={{
          ...SITE,
          location: { name: "Chatan, Okinawa, Japan" },
          dive_count: 12,
          last_dived_on: "2026-09-14",
          max_dive_depth: 21.4,
          species_count: 7,
          average_rating: 4.25,
        }}
      />,
    );

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Sunabe Seawall",
    });
    expect(heading.nextElementSibling).toHaveTextContent(
      "Chatan, Okinawa, Japan",
    );
    expect(figure("Dives")).toHaveTextContent("12");
    expect(figure("Last dive")).toHaveTextContent("Sep 14, 2026");
    expect(figure("Deepest")).toHaveTextContent("21 m");
    expect(figure("Species seen")).toHaveTextContent("7");
    expect(figure("Average rating")).toHaveTextContent("4.3 of 5");
    expect(
      screen.getByRole("link", { name: "Back to dive sites" }),
    ).toHaveAttribute("href", "/sites");
  });

  it("counts no dives, and leaves off every figure no dive gives it", () => {
    render(<DiveSiteHero site={{ ...SITE, dive_count: 0 }} />);

    expect(figure("Dives")).toHaveTextContent("0");
    for (const label of [
      "Last dive",
      "Deepest",
      "Species seen",
      "Average rating",
    ]) {
      expect(screen.queryByText(label, { selector: "dt" })).toBeNull();
    }
  });

  it("hands its map the site's pin, as the card's backdrop", () => {
    render(
      <DiveSiteHero site={{ ...SITE, latitude: 26.33, longitude: 127.74 }} />,
    );

    expect(vi.mocked(LocationsMap).mock.lastCall![0]).toMatchObject({
      locations: [
        { name: "Sunabe Seawall", latitude: 26.33, longitude: 127.74 },
      ],
      backdrop: true,
      snapshot: true,
      sideFade: true,
    });
  });

  it("draws the map's water for a site with no position", () => {
    render(<DiveSiteHero site={SITE} />);

    expect(LocationsMap).not.toHaveBeenCalled();
  });
});

describe("DiveSiteSpeciesCard", () => {
  const species = (
    uuid: string,
    common_name: string | null,
    scientific_name: string,
    dive_count: number,
  ): SpeciesLifeListEntry => ({
    uuid,
    common_name,
    scientific_name,
    rank: "Species",
    photo_sha256: null,
    dive_count,
    first_seen: "2026-01-01T09:00:00+09:00",
    last_seen: "2026-09-14T09:00:00+09:00",
  });

  it("lists the species seen at the site, each linking to its own page", async () => {
    vi.mocked(speciesAPI.getLifeList).mockResolvedValue({
      data: [
        species("sp-1", "Clark's anemonefish", "Amphiprion clarkii", 3),
        species("sp-2", null, "Chromodoris willani", 1),
      ],
      total_count: 2,
      has_more: false,
      page: 1,
      items_per_page: 100,
    });
    render(<DiveSiteSpeciesCard siteUuid="site-1" speciesCount={2} />);

    const clownfish = await screen.findByRole("link", {
      name: /Clark's anemonefish/,
    });
    expect(clownfish).toHaveAttribute("href", "/species/sp-1");
    expect(clownfish).toHaveTextContent("3 dives");
    expect(
      screen.getByRole("link", { name: /Chromodoris willani/ }),
    ).toHaveAttribute("href", "/species/sp-2");
    expect(speciesAPI.getLifeList).toHaveBeenCalledWith(1, 100, {
      diveSiteUuid: "site-1",
    });
  });

  it("asks nothing, and draws nothing, while the hero counts none", async () => {
    const { container } = render(
      <DiveSiteSpeciesCard siteUuid="site-1" speciesCount={0} />,
    );

    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(speciesAPI.getLifeList).not.toHaveBeenCalled());
  });

  it("says so when they cannot be read", async () => {
    vi.mocked(speciesAPI.getLifeList).mockRejectedValue(new Error("500"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<DiveSiteSpeciesCard siteUuid="site-1" speciesCount={2} />);

    expect(
      await screen.findByText("The species could not be loaded."),
    ).toBeInTheDocument();
  });
});
