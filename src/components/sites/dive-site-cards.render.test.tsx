import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import type { DiveSite } from "@/lib/api/dive-sites";
import type { SpeciesLifeListEntry } from "@/lib/api/species";
import { DiveSiteHero } from "./dive-site-hero";
import { DiveSiteSpeciesCard } from "./dive-site-species-card";

// What the site page says about the site itself: its hero, with what the site
// records and what the diver's dives there add up to, and the species seen on
// them.

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

beforeEach(() => {
  account.user.units = "metric";
  vi.mocked(speciesAPI.getLifeList).mockReset();
  vi.mocked(LocationsMap).mockClear();
});

describe("DiveSiteHero", () => {
  const figure = (label: string) =>
    screen.getByText(label, { selector: "dt" }).nextElementSibling;

  it("heads the page with the site's name and its card's line over every figure its dives add up to", () => {
    render(
      <DiveSiteHero
        site={{
          ...SITE,
          location: { name: "Chatan, Okinawa, Japan" },
          water_type: "salt",
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
      "Chatan, Okinawa, Japan · Water type Salt water · Depth 3 m – 18 m · Altitude 2 m · Entry types Shore, Pier",
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

  it("says one end of a depth range where only one is recorded", () => {
    render(<DiveSiteHero site={{ ...SITE, depth_to: 40 }} />);

    expect(
      screen.getByRole("heading", { level: 1 }).nextElementSibling,
    ).toHaveTextContent("Depth To 40 m");
  });

  it("reads the line's depths and altitude in the diver's units", () => {
    account.user.units = "imperial";
    render(
      <DiveSiteHero
        site={{ ...SITE, depth_from: 4.57, depth_to: 30.48, altitude: 1829 }}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1 }).nextElementSibling,
    ).toHaveTextContent("Depth 15 ft – 100 ft · Altitude 6001 ft");
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
