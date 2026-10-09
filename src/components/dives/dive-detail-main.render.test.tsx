import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DiveDetailMain } from "./dive-detail-main";
import type { Dive } from "@/lib/api/dives";

// These renders read the diver's units, so they need an auth context.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "test",
    dive_number: 1,
    start_time: "2021-04-04T10:04:47+02:00",
    duration: 2700,
    dive_sites: [],
    mixtures: [],
    ...overrides,
  } as Dive;
}

// A sighting as the detail read carries one: the species' summary, and nothing
// counted or written unless a test says so.
function sighting(
  overrides: Partial<NonNullable<Dive["sightings"]>[number]> = {},
): NonNullable<Dive["sightings"]>[number] {
  return {
    uuid: "species-1",
    scientific_name: "Amphiprion ocellaris",
    common_name: "Ocellaris clownfish",
    rank: "Species",
    count: null,
    notes: "",
    ...overrides,
  };
}

// What the dive page decides about its species; how one species reads as a
// card is `species-card.render.test.tsx`'s.
describe("DiveDetailMain species card", () => {
  const CLOWNFISH = sighting();
  const MORAY = sighting({
    uuid: "species-2",
    scientific_name: "Gymnothorax javanicus",
    common_name: "Giant moray",
  });

  it("draws a card for each species spotted, in spotting order", () => {
    render(<DiveDetailMain dive={dive({ sightings: [MORAY, CLOWNFISH] })} />);

    expect(screen.getByText("Species Spotted")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href")?.startsWith("/species/"))
        .map((link) => link.textContent),
    ).toEqual(["Giant moray", "Ocellaris clownfish"]);
  });

  it("renders no card at all for a dive with nothing spotted", () => {
    // Absent and empty alike: the API embeds sightings on the detail response
    // only, so a list row has no key.
    render(<DiveDetailMain dive={dive({ sightings: [] })} />);
    expect(screen.queryByText("Species Spotted")).not.toBeInTheDocument();

    render(<DiveDetailMain dive={dive()} />);
    expect(screen.queryByText("Species Spotted")).not.toBeInTheDocument();
  });
});

describe("DiveDetailMain species card counts and notes", () => {
  const MANTA = sighting({
    uuid: "species-manta",
    scientific_name: "Mobula birostris",
    common_name: "Giant manta ray",
    count: 3,
    notes: "Cleaning station\nat 18 m",
  });
  const TURTLE = sighting({
    uuid: "species-turtle",
    scientific_name: "Chelonia mydas",
    common_name: "Green sea turtle",
  });

  const cardOf = (name: string) =>
    within(screen.getByRole("link", { name }).closest("li")!);

  it("shows how many were counted, and the note with its line breaks", () => {
    render(<DiveDetailMain dive={dive({ sightings: [MANTA, TURTLE] })} />);

    const manta = cardOf("Giant manta ray");
    expect(
      manta.getByText("Count", { selector: "dt" }).nextElementSibling,
    ).toHaveTextContent("3");
    expect(
      manta.getByText((_, element) => element?.textContent === MANTA.notes, {
        selector: "span",
      }),
    ).toHaveClass("whitespace-pre-wrap");
  });

  it("gives an uncounted sighting no count, never 1", () => {
    render(<DiveDetailMain dive={dive({ sightings: [MANTA, TURTLE] })} />);

    expect(
      cardOf("Green sea turtle").queryByText("Count", { selector: "dt" }),
    ).not.toBeInTheDocument();
  });
});
