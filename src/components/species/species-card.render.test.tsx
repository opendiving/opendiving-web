import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";

import type { SpeciesSummary } from "@/lib/api/species";
import { reveal } from "@/test/intersection";
import { SpeciesBackdrop, SpeciesCard } from "./species-card";

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

    // The sharp photo and the blurred copy of it under the card's foot.
    const images = [...container.querySelectorAll("img")];
    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(image.getAttribute("src")).toContain(
        "/species/species-1/photo?v=",
      );
      // Decorative: the link beside it carries the name.
      expect(image).toHaveAttribute("alt", "");
    }
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

describe("SpeciesBackdrop", () => {
  const PHOTO = "/species/species-1/photo?v=9f86d081";
  const backdrop = (props: Parameters<typeof SpeciesBackdrop>[0]) => {
    const { container } = render(<SpeciesBackdrop {...props} />);
    const [blurred, sharp] = [...container.querySelectorAll("img")];
    return { blurred, sharp };
  };

  // A `calc()` the sharp photo is placed by, worked out on a card this tall.
  const px = (expression: string, cardHeight: number) =>
    Number(
      new Function(
        `return ${expression
          .replace(/^calc/, "")
          .replace(/100%/g, String(cardHeight))
          .replace(/px/g, "")}`,
      )(),
    );

  // A card with no note: a 132px band over 110px of details.
  const CARD = 242;
  const COVERED = 110;
  const BAND = CARD - COVERED;

  it("centres a card's photo 8px below the middle of the band above the details", () => {
    const { sharp } = backdrop({ photo: PHOTO, coveredBottom: COVERED });

    expect(sharp).toHaveClass("-translate-y-1/2", "w-full");
    expect(px(sharp.style.top, CARD)).toBe(BAND / 2 + 8);
  });

  it("draws a card's photo tall enough that its faded foot lies under the details", () => {
    const { sharp } = backdrop({ photo: PHOTO, coveredBottom: COVERED });
    const centre = px(sharp.style.top, CARD);
    const shortest = px(sharp.style.minHeight, CARD);

    // Cropped at the sides rather than drawn shorter, for a wide photo.
    expect(sharp).toHaveClass("object-cover");
    // The fade starts no higher than the details' top...
    expect(centre + shortest / 2 - 48).toBeGreaterThanOrEqual(BAND);
    // ...and the photo's top is never below the card's.
    expect(centre - shortest / 2).toBeLessThanOrEqual(0);
  });

  it("fills the rest of a card with a blurred copy of the same photo", () => {
    const { blurred, sharp } = backdrop({
      photo: PHOTO,
      coveredBottom: COVERED,
    });

    expect(blurred.getAttribute("src")).toBe(sharp.getAttribute("src"));
    expect(blurred).toHaveClass("blur-[28px]", "object-cover");
  });

  it("draws a hero's photo once, across it, rather than framed as a card's", () => {
    const { container } = render(
      <SpeciesBackdrop hero photo={PHOTO} coveredBottom={110} />,
    );

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveClass("size-full", "object-cover");
  });
});
