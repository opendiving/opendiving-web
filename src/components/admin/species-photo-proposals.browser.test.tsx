import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { page } from "vitest/browser";

import type { AdminSpecies, AdminSpeciesPhotoProposal } from "@/lib/api/admin";
import { SpeciesCatalogFrame } from "./species-catalog-frame";
import { SpeciesCatalogCard } from "./species-catalog-card";
import { SpeciesPhotoProposals } from "./species-photo-proposals";

// The claim is the stylesheet's: the card spanning the grid's row, the two
// photos side by side, and nothing wider than a phone. See "jsdom answers no
// layout question" in DECISIONS.md.
import "@/app/globals.css";

const WIDTH = 390;

// Any decodable image will do: the box is reserved either way.
const PREVIEW =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='gray'/></svg>";

const species = {
  uuid: "01a073b4-2235-7b48-8ee7-68d0d99b9808",
  scientific_name: "Pterois miles",
  common_name: "Devil firefish",
  rank: "Species",
  photo_sha256: null,
  wikidata_qid: "Q1056979",
  created_at: "2026-10-01T10:00:00+00:00",
  photo_source_url: null,
  photo_file: null,
  photo_curation: null,
  photo_width: null,
  photo_height: null,
  photo_proposals_waiting: 1,
} as unknown as AdminSpecies;

const proposal: AdminSpeciesPhotoProposal = {
  uuid: "01a073b4-0000-7b48-8ee7-000000000001",
  file: "Pterois_miles_Red_Sea_Dahab_Lighthouse_reef_2019_very_long_title_without_any_break.jpg",
  note: "The whole animal, side on, fins spread, against open water; the stored photo is a close-up of the head that the frame crops to an eye.",
  proposer_name: "A rating script run by the operator of this instance",
  created_at: "2026-11-13T10:00:00+00:00",
  width: 4000,
  height: 3000,
  license: "CC BY-SA 4.0",
  author: "Somebody with a long name, credited as Commons asks",
  source_url: null,
  preview: PREVIEW,
};

beforeEach(async () => {
  await page.viewport(WIDTH, 900);
});

const within390 = (element: Element) => {
  const box = element.getBoundingClientRect();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(WIDTH);
  // Text running out of its own box past a clipping ancestor moves no edge.
  expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
};

describe("a species card with a proposed photo, 390 px wide", () => {
  it("shows both photos, the note and both buttons, with nothing scrolling sideways", () => {
    render(
      <SpeciesCatalogFrame
        isLoading={false}
        totalCount={2}
        cards={[
          <SpeciesCatalogCard
            key="proposed"
            species={species}
            busy={null}
            onAction={vi.fn()}
            proposals={
              <SpeciesPhotoProposals
                species={species}
                read={{ state: "loaded", count: 1, proposals: [proposal] }}
                disabled={false}
                deciding={null}
                onAccept={vi.fn()}
                onDecline={vi.fn()}
                onRetry={vi.fn()}
              />
            }
          />,
          <SpeciesCatalogCard
            key="other"
            species={{ ...species, uuid: "other", photo_proposals_waiting: 0 }}
            busy={null}
            onAction={vi.fn()}
          />,
        ]}
      />,
    );

    const tile = screen.getByRole("listitem", {
      name: `Proposed by ${proposal.proposer_name}`,
    });
    const [current, proposed] = within(tile).getAllByRole("figure");
    within390(current);
    within390(proposed);
    // Side by side, not stacked.
    expect(proposed.getBoundingClientRect().left).toBeGreaterThan(
      current.getBoundingClientRect().right - 1,
    );
    expect(
      Math.abs(
        proposed.getBoundingClientRect().top -
          current.getBoundingClientRect().top,
      ),
    ).toBeLessThan(1);
    within390(within(tile).getByText(proposal.note));
    within390(within(tile).getByText(proposal.file));
    within390(within(tile).getByRole("button", { name: "Accept" }));
    within390(within(tile).getByRole("button", { name: "Decline" }));

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(WIDTH);
  });
});
