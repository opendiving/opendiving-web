import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

import type { DiveSite } from "@/lib/api/dive-sites";
import type { SpeciesLifeListEntry } from "@/lib/api/species";
import { UnplacedBackdrop } from "@/components/ui/backdrop-card";
import { DiveSiteHero } from "./dive-site-hero";
import { DiveSiteInfoCard } from "./dive-site-info-card";
import { DiveSiteSpeciesCard } from "./dive-site-species-card";

// What the site page says about the site itself: its hero, with the line the
// site's card carries and what the diver's dives there add up to, the rest of
// what it records, and the species seen on them.

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
vi.mock("@/components/map/map-backdrop", () => ({
  MapBackdrop: vi.fn(() => null),
  useMapTiles: () => true,
}));

const { speciesAPI } = await import("@/lib/api/species");
const { MapBackdrop } = await import("@/components/map/map-backdrop");

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
  vi.mocked(MapBackdrop).mockClear();
});

describe("DiveSiteInfoCard", () => {
  it("shows every member the site has", () => {
    render(
      <DiveSiteInfoCard
        site={{
          ...SITE,
          other_names: ["砂辺", "Sunabe"],
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
    render(<DiveSiteInfoCard site={{ ...SITE, tags: ["macro"] }} />);

    for (const label of [
      "Also known as",
      "Coordinates",
      "In other registries",
    ]) {
      expect(
        screen.queryByText(label, { selector: "div" }),
      ).not.toBeInTheDocument();
    }
  });

  // Nothing of it would be left but the heading.
  it("draws no card for a site that records none of it", () => {
    const { container } = render(<DiveSiteInfoCard site={SITE} />);

    expect(container).toBeEmptyDOMElement();
  });

  // Each is on the line in the hero above it.
  it("leaves the place, its water, depths, altitude and entry to the hero", () => {
    render(
      <DiveSiteInfoCard
        site={{
          ...SITE,
          location: { name: "Chatan, Okinawa, Japan" },
          water_type: "salt",
          depth_from: 3,
          depth_to: 18,
          altitude: 2,
          entry_types: ["shore"],
          // So that there is a card to look in.
          tags: ["macro"],
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Dive Site Information" }),
    ).toBeInTheDocument();
    for (const label of [
      "Location",
      "Water type",
      "Depth",
      "Altitude",
      "Entry type",
      "Added on",
    ]) {
      expect(
        screen.queryByText(label, { selector: "div" }),
      ).not.toBeInTheDocument();
    }
  });
});

const BACK = { href: "/sites", label: "Back to dive sites" };

describe("DiveSiteHero", () => {
  const figure = (label: string) =>
    screen.getByText(label, { selector: "dt" }).nextElementSibling;

  it("heads the page with the site's name and its card's line over every figure its dives add up to", () => {
    render(
      <DiveSiteHero
        back={BACK}
        site={{
          ...SITE,
          location: { name: "Chatan, Okinawa, Japan" },
          water_type: "fresh",
          depth_from: 3,
          depth_to: 18,
          altitude: 2,
          entry_types: ["shore", "pier"],
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
      "Chatan, Okinawa, Japan · Water type Fresh water · Depth 3 m – 18 m · Altitude 2 m · Entry types Shore, Pier",
    );
    expect(figure("Dives")).toHaveTextContent("12");
    expect(figure("Last dive")).toHaveTextContent("Sep 14, 2026");
    expect(figure("Deepest")).toHaveTextContent("21 m");
    expect(figure("Species seen")).toHaveTextContent("7");
    expect(figure("Average rating")).toHaveTextContent("4.3 of 5");
    // The date last, as the one figure wider than the rest.
    expect(
      Array.from(document.querySelectorAll("dt"), (dt) => dt.textContent),
    ).toEqual([
      "Dives",
      "Deepest",
      "Species seen",
      "Average rating",
      "Last dive",
    ]);
    expect(
      screen.getByRole("link", { name: "Back to dive sites" }),
    ).toHaveAttribute("href", "/sites");
  });

  // The sea goes without saying.
  it("leaves salt water off its line", () => {
    render(
      <DiveSiteHero
        back={BACK}
        site={{ ...SITE, water_type: "salt", altitude: 2 }}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1 }).nextElementSibling,
    ).toHaveTextContent(/^Altitude 2 m$/);
  });

  it("says one end of a depth range where only one is recorded", () => {
    render(<DiveSiteHero back={BACK} site={{ ...SITE, depth_to: 40 }} />);

    expect(
      screen.getByRole("heading", { level: 1 }).nextElementSibling,
    ).toHaveTextContent("Depth To 40 m");
  });

  it("reads the line's depths and altitude in the diver's units", () => {
    account.user.units = "imperial";
    render(
      <DiveSiteHero
        back={BACK}
        site={{ ...SITE, depth_from: 4.57, depth_to: 30.48, altitude: 1829 }}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1 }).nextElementSibling,
    ).toHaveTextContent("Depth 15 ft – 100 ft · Altitude 6001 ft");
  });

  it("counts no dives, and leaves off every figure no dive gives it", () => {
    render(<DiveSiteHero back={BACK} site={{ ...SITE, dive_count: 0 }} />);

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

  it("hands its map the site's pin, laid out as a hero's", () => {
    render(
      <DiveSiteHero
        back={BACK}
        site={{ ...SITE, latitude: 26.33, longitude: 127.74 }}
      />,
    );

    expect(vi.mocked(MapBackdrop).mock.lastCall![0]).toMatchObject({
      locations: [
        { name: "Sunabe Seawall", latitude: 26.33, longitude: 127.74 },
      ],
      hero: true,
    });
    // Which the hero credits at its details' foot instead.
    expect(
      screen.getByRole("link", { name: /OpenStreetMap/ }),
    ).toBeInTheDocument();
  });

  it("draws the map's water for a site with no position, and credits no map", () => {
    render(<DiveSiteHero back={BACK} site={SITE} />);

    const { water } = vi.mocked(MapBackdrop).mock.lastCall![0];
    expect((water as React.ReactElement).type).toBe(UnplacedBackdrop);
    expect(screen.queryByRole("link", { name: /OpenStreetMap/ })).toBeNull();
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
