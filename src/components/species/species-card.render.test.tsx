import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";

import type { SpeciesSummary } from "@/lib/api/species";
import { reveal } from "@/test/intersection";
import { SpeciesCard } from "./species-card";

const DIGEST =
  "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

function species(overrides: Partial<SpeciesSummary> = {}): SpeciesSummary {
  return {
    uuid: "species-1",
    scientific_name: "Amphiprion ocellaris",
    common_name: "Ocellaris clownfish",
    rank: "Species",
    photo_sha256: null,
    ...overrides,
  };
}

// The card is a list item, as every backdrop card is.
const card = (props: Parameters<typeof SpeciesCard>[0]) =>
  render(
    <ul>
      <SpeciesCard {...props} />
    </ul>,
  );

describe("SpeciesCard", () => {
  it("links to the species' page, named by its common name", () => {
    card({ species: species() });

    expect(
      screen.getByRole("link", { name: "Ocellaris clownfish" }),
    ).toHaveAttribute("href", "/species/species-1");
  });

  it("italicises the scientific name under it, by the binomial convention", () => {
    card({ species: species() });

    expect(screen.getByText("Amphiprion ocellaris")).toHaveClass("italic");
  });

  it("names the rank when the species is broader than one", () => {
    // "a moray eel" is an honest log entry and resolves to a family;
    // "Muraenidae" on its own would read as a species and isn't one.
    card({
      species: species({
        scientific_name: "Muraenidae",
        common_name: "Moray eels",
        rank: "Family",
      }),
    });

    expect(screen.getByText("Muraenidae (Family)")).toBeInTheDocument();
  });

  it("goes by its scientific name where it has no common one, and says it once", () => {
    card({
      species: species({
        scientific_name: "Chromodoris annae",
        common_name: null,
      }),
    });

    expect(
      screen.getByRole("link", { name: "Chromodoris annae" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Chromodoris annae")).toHaveLength(1);
  });

  it("draws the photo once the card is on screen, versioned by its digest", () => {
    const { container } = card({
      species: species({ photo_sha256: DIGEST }),
    });
    act(() => reveal());

    const images = [...container.querySelectorAll("img")];
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("src")).toContain(
      "/species/species-1/photo?v=",
    );
    // Decorative: the link beside it carries the name.
    expect(images[0]).toHaveAttribute("alt", "");
  });

  it("draws the water, not a broken image, for a species with no photo", () => {
    const { container } = card({ species: species() });
    act(() => reveal());

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".lucide-fish")).not.toBeNull();
  });

  it("carries the caller's figures and line under the names", () => {
    card({
      species: species(),
      figures: [{ label: "Dives", value: 4 }],
      children: "Apr 8, 2025",
    });

    expect(
      screen.getByText("Dives", { selector: "dt" }).nextElementSibling,
    ).toHaveTextContent("4");
    expect(screen.getByText("Apr 8, 2025")).toBeInTheDocument();
  });
});
