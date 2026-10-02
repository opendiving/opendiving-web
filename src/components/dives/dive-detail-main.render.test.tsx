import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("DiveDetailMain species card", () => {
  const CLOWNFISH = sighting();

  it("lists what was spotted, common name first", () => {
    render(<DiveDetailMain dive={dive({ sightings: [CLOWNFISH] })} />);

    expect(screen.getByText("Species Spotted")).toBeInTheDocument();
    expect(screen.getByText("Ocellaris clownfish")).toBeInTheDocument();
    expect(screen.getByText("Amphiprion ocellaris")).toBeInTheDocument();
  });

  it("italicises the scientific name, by the binomial convention", () => {
    render(<DiveDetailMain dive={dive({ sightings: [CLOWNFISH] })} />);

    expect(screen.getByText("Amphiprion ocellaris")).toHaveClass("italic");
  });

  it("names the rank when the sighting is broader than a species", () => {
    // "a moray eel" is an honest log entry and resolves to a family;
    // "Muraenidae" on its own would read as a species and isn't one.
    render(
      <DiveDetailMain
        dive={dive({
          sightings: [
            sighting({
              uuid: "species-2",
              scientific_name: "Muraenidae",
              common_name: null,
              rank: "Family",
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText("Muraenidae (Family)")).toBeInTheDocument();
  });

  it("dashes the common name a species doesn't have", () => {
    render(
      <DiveDetailMain
        dive={dive({
          sightings: [
            sighting({
              uuid: "species-3",
              scientific_name: "Chromodoris annae",
              common_name: null,
            }),
          ],
        })}
      />,
    );

    expect(screen.getByText("\u2014")).toBeInTheDocument();
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

  const cellsOf = (name: string) =>
    [...screen.getByRole("link", { name }).closest("tr")!.children].map(
      (cell) => cell.textContent,
    );

  it("shows how many were counted and the note beside the names", () => {
    render(<DiveDetailMain dive={dive({ sightings: [MANTA, TURTLE] })} />);

    expect(
      screen.getByRole("columnheader", { name: "Count" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Notes" }),
    ).toBeInTheDocument();
    expect(cellsOf("Giant manta ray").slice(1)).toEqual([
      "Giant manta ray",
      "Mobula birostris",
      "3",
      "Cleaning station\nat 18 m",
    ]);
  });

  it("leaves an uncounted sighting's count blank, never 1", () => {
    render(<DiveDetailMain dive={dive({ sightings: [MANTA, TURTLE] })} />);

    expect(cellsOf("Green sea turtle").slice(1)).toEqual([
      "Green sea turtle",
      "Chelonia mydas",
      "",
      "",
    ]);
  });

  it("keeps a note's line breaks", () => {
    render(<DiveDetailMain dive={dive({ sightings: [MANTA] })} />);

    expect(
      screen.getByText((_, element) => element?.textContent === MANTA.notes),
    ).toHaveClass("whitespace-pre-wrap");
  });

  it("adds no column that no sighting fills", () => {
    render(<DiveDetailMain dive={dive({ sightings: [TURTLE] })} />);

    expect(
      screen.queryByRole("columnheader", { name: "Count" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Notes" }),
    ).not.toBeInTheDocument();
  });
});

// The image column, in the half jsdom can answer. Whether the rows end up the
// same *height* is a layout question and jsdom performs no layout - every
// `getBoundingClientRect()` there is zeroed, so such an assertion would pass
// against any markup at all. That half is `dive-detail-main.browser.test.tsx`.
//
// What is pinned here is what the DOM alone settles: a row with a digest renders
// an image, a row without renders none, and the photo is never the thing that
// carries a species' name.
describe("DiveDetailMain species photos", () => {
  const PHOTOGRAPHED = sighting({
    photo_sha256:
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  });

  const UNPHOTOGRAPHED = sighting({
    uuid: "species-2",
    scientific_name: "Chromodoris annae",
    common_name: "Anna's chromodoris",
    photo_sha256: null,
  });

  it("renders a thumbnail for a species that has a photo", () => {
    const { container } = render(
      <DiveDetailMain dive={dive({ sightings: [PHOTOGRAPHED] })} />,
    );

    const images = [...container.querySelectorAll("img")];
    expect(images).toHaveLength(1);
    // Built against the API client's own base, and carrying the digest so a
    // replaced photo cannot be served from the browser's cache.
    expect(images[0].getAttribute("src")).toContain(
      `/species/${PHOTOGRAPHED.uuid}/photo?v=`,
    );
  });

  it("draws nothing at all in the cell of a species without one", () => {
    // Not a placeholder, not a broken-image glyph, not stranded alt text. The
    // cell is still there - that is what keeps the rows aligned - and it is
    // empty.
    const { container } = render(
      <DiveDetailMain dive={dive({ sightings: [UNPHOTOGRAPHED] })} />,
    );

    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("renders one image for the photographed row of a mixed table", () => {
    const { container } = render(
      <DiveDetailMain
        dive={dive({ sightings: [PHOTOGRAPHED, UNPHOTOGRAPHED] })}
      />,
    );

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("links each species to its page, naming the link once", () => {
    render(<DiveDetailMain dive={dive({ sightings: [PHOTOGRAPHED] })} />);

    // Exactly one *named* link per species, even though the thumbnail beside it
    // is clickable too: the image link is `aria-hidden` and out of the tab order
    // precisely so a screen reader's link list doesn't carry the same
    // destination twice with nothing to tell them apart.
    const named = screen.getAllByRole("link", {
      name: "Ocellaris clownfish",
    });
    expect(named).toHaveLength(1);
    expect(named[0]).toHaveAttribute("href", `/species/${PHOTOGRAPHED.uuid}`);
  });

  it("names the link for a species with no common name", () => {
    // The visible cell is an em-dash for these, and "—" is not a link name -
    // so the accessible name falls back to the binomial rather than to nothing.
    render(
      <DiveDetailMain
        dive={dive({
          sightings: [
            sighting({
              uuid: "species-3",
              scientific_name: "Muraenidae",
              common_name: null,
              rank: "Family",
              photo_sha256: null,
            }),
          ],
        })}
      />,
    );

    expect(screen.getByRole("link", { name: "Muraenidae" })).toHaveAttribute(
      "href",
      "/species/species-3",
    );
  });
});
