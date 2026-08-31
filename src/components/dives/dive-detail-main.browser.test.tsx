import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { DiveDetailMain } from "./dive-detail-main";
import type { Dive } from "@/lib/api/dives";

// **Load-bearing, and it looks like a stray import** - the same one
// `form-api-error.browser.test.tsx` and `map-picker.browser.test.tsx` document.
// Nothing in the browser project loads this app's Tailwind, and every assertion
// below is about what `h-12`, `w-16` and the table's own padding compute to.
// Without it `h-12` measures 0px, both rows collapse to the height of their
// text, and the test passes against exactly the markup it exists to reject.
//
// Verified by the negative control this lane asks for rather than assumed. With
// the reserved box removed - `SpeciesThumbnail` returning `null` instead of an
// empty div, which is the regression these guards exist for - the first two
// tests **fail with this import and pass without it**. That is the whole
// warning in DECISIONS.md reproduced on this file: the environment is real, the
// numbers are not zeroes, and the guards are worthless anyway.
//
// The third test is what stops that going unnoticed again. It asserts the row is
// taller than a bare line of text, which is only true once Tailwind has loaded -
// so deleting this import fails it loudly instead of quietly hollowing out the
// two above.
import "@/app/globals.css";

// This file exists for one claim about the species card that jsdom cannot check:
// **a row whose species has no photo sits at the same height as a row whose
// species has one.** That is a layout question, and "jsdom answers no layout
// question" (DECISIONS.md) - the DOM-side half, that an image element is there
// or isn't, is pinned in `dive-detail-main.render.test.tsx` instead.
//
// The invariant is what makes the empty cell the right answer rather than a hole.
// A thumbnail is taller than a line of text, and every row of a `<Table>` gets
// the leading cell whether or not anything is drawn into it - so the space is
// spent either way, and a row that collapsed would be the one that looked broken.

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

const DIGEST =
  "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

// The same fixture shape `dive-detail-main.render.test.tsx` uses, spread through
// `Partial<Dive>` for the same reason: a `Dive` has a dozen fields this card
// never reads, and a literal naming only the ones it does is not assignable.
function dive(species: Dive["species"]): Dive {
  return {
    uuid: "test",
    dive_number: 1,
    start_time: "2021-04-04T10:04:47+02:00",
    duration: 2700,
    dive_sites: [],
    mixtures: [],
    ...({ species } as Partial<Dive>),
  } as Dive;
}

// The photo is fetched from an API this test has no server for, so the `<img>`
// never loads. That is the right thing to measure against anyway: the row height
// must come from the reserved box rather than from the bytes, or it would depend
// on a network round trip and shift as photos arrived.
function rowHeights(species: Dive["species"]): number[] {
  const { container, unmount } = render(
    <DiveDetailMain dive={dive(species)} />,
  );
  const rows = [...container.querySelectorAll("tbody tr")];
  // Measured *before* unmounting: a detached element's bounding rect is all
  // zeros, so a read afterwards would compare two sets of zeros and pass
  // whatever the markup did.
  const heights = rows.map((row) => row.getBoundingClientRect().height);
  unmount();
  return heights;
}

const WITH_PHOTO = {
  uuid: "species-1",
  scientific_name: "Amphiprion ocellaris",
  common_name: "Ocellaris clownfish",
  rank: "Species",
  photo_sha256: DIGEST,
};

const WITHOUT_PHOTO = {
  uuid: "species-2",
  scientific_name: "Chromodoris annae",
  common_name: "Anna's chromodoris",
  rank: "Species",
  photo_sha256: null,
};

// A second photo-less species, because a table of two rows keyed the same is a
// table of one row as far as React is concerned - and the duplicate-key warning
// is the only thing that would have said so.
const ALSO_WITHOUT_PHOTO = {
  uuid: "species-3",
  scientific_name: "Muraenidae",
  common_name: null,
  rank: "Family",
  photo_sha256: null,
};

// Rows are compared to within a pixel rather than for exact equality. The
// difference this absorbs is the table's own last-row border, not anything about
// the image column: measured, the two rows come back 81 and 80.5. A whole
// pixel is far below what this test is looking for - the failure it exists to
// catch is a row collapsing to text height, which is a difference of thirty-odd.
function expectLevel(a: number, b: number) {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
}

describe("the species card's image column keeps its rows level", () => {
  it("gives a photo-less row the same height as a photographed one", () => {
    const [photographed, bare] = rowHeights([WITH_PHOTO, WITHOUT_PHOTO]);

    expectLevel(bare, photographed);
  });

  it("holds that height across a table of nothing but photo-less rows", () => {
    // The case the first test cannot see: if the box were only reserved because
    // a *sibling* row happened to be taller, a table with no photos at all would
    // sit at text height and the column would collapse the moment a diver logged
    // species the catalog has no pictures for - which is most of the register.
    const [mixed] = rowHeights([WITH_PHOTO, WITHOUT_PHOTO]);
    const [allBare] = rowHeights([WITHOUT_PHOTO, ALSO_WITHOUT_PHOTO]);

    expectLevel(allBare, mixed);
  });

  it("reserves more than a line of text, which is why this matters at all", () => {
    // The control for the two above, and the stylesheet canary described at the
    // top of this file. If the thumbnail box were free - no taller than the text
    // beside it - both would pass against markup that reserved nothing, and this
    // file would be measuring its own assumptions. Measured with Tailwind loaded
    // the row is 81px; measured without it, it is text height and this fails.
    const { container, unmount } = render(
      <DiveDetailMain dive={dive([WITH_PHOTO])} />,
    );
    const speciesRow = container
      .querySelector("tbody tr")!
      .getBoundingClientRect().height;
    unmount();

    // `h-12` is 48px; the row is that plus the cell padding. A row of bare text
    // in this table is nowhere near it.
    expect(speciesRow).toBeGreaterThan(48);
  });
});
