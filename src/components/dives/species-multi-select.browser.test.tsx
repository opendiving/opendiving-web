import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { page } from "vitest/browser";

import { SpeciesMultiSelect } from "./species-multi-select";
import type { SightingWrite } from "@/lib/api/dives";
import type { SpeciesSummary } from "@/lib/api/species";

// **Load-bearing, and it looks like a stray import** - the one every geometry
// test in this lane carries. Without it the count box and the notes box have no
// height of their own, a bare row collapses to three lines of text, and the level
// test below passes against any markup at all. The third test is the canary.
import "@/app/globals.css";

// Two claims about the picker's rows that jsdom cannot check (DECISIONS.md, "jsdom
// answers no layout question"): **a row whose note fits one line stands as tall
// as a row with no note, and a row carrying a band as tall as one carrying a
// count.** Every input is on every row whatever it holds, and the notes box is one
// line until its note needs more - so typing the first word of a note, or
// choosing a band, does not push the rest of the form down.

const MANTA: SpeciesSummary = {
  uuid: "species-manta",
  scientific_name: "Mobula birostris",
  common_name: "Giant manta ray",
  rank: "Species",
};

const CLOWNFISH: SpeciesSummary = {
  uuid: "species-clownfish",
  scientific_name: "Amphiprion ocellaris",
  common_name: "Ocellaris clownfish",
  rank: "Species",
};

// A phone, where the boxes compute to 16px text, and Tailwind's `md`, where they
// drop to 14px - the row's height comes out different at each, and it has to be
// level at both.
const NARROW = 393;
const WIDE = 1024;

function rowHeights(value: SightingWrite[]): number[] {
  const { container, unmount } = render(
    <SpeciesMultiSelect
      value={value}
      knownSpecies={[MANTA, CLOWNFISH]}
      onChange={() => {}}
    />,
  );
  // Measured before unmounting: a detached element's rect is all zeros.
  const heights = [...container.querySelectorAll("li")].map(
    (row) => row.getBoundingClientRect().height,
  );
  unmount();
  return heights;
}

function expectLevel(a: number, b: number) {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
}

describe("the species picker's rows stay level", () => {
  for (const width of [NARROW, WIDE]) {
    it(`gives a row with a one-line note the height of a bare row at ${width}px`, async () => {
      await page.viewport(width, 800);

      const [noted, bare] = rowHeights([
        { species_uuid: MANTA.uuid, count: 3, notes: "Cleaning station" },
        { species_uuid: CLOWNFISH.uuid },
      ]);

      expectLevel(noted, bare);
    });
  }

  it("grows a row whose note runs past one line", async () => {
    // The control for the test above: a notes box of fixed height would pass it
    // too, while clipping every longer note to its first line. Narrow, where the
    // notes box stacks under the count: side by side, the count's quick choices
    // stand taller than a three-line note.
    await page.viewport(NARROW, 800);

    const [noted, bare] = rowHeights([
      { species_uuid: MANTA.uuid, notes: "Cleaning station\nat 18 m\ntwo" },
      { species_uuid: CLOWNFISH.uuid },
    ]);

    expect(noted).toBeGreaterThan(bare + 20);
  });

  it("stands a bare row taller than its padding, header and boxes, which only the stylesheet makes true", async () => {
    // The stylesheet canary. At `md` the row's `p-4`, its 36px header, the
    // labelled count box over its quick choices and the notes box beside them
    // come to about 200px; without Tailwind a bare row is a few lines of text and
    // bare controls, about 100px, and the level tests measure nothing.
    await page.viewport(WIDE, 800);

    const [bare] = rowHeights([{ species_uuid: CLOWNFISH.uuid }]);

    expect(bare).toBeGreaterThan(120);
  });

  for (const width of [NARROW, WIDE]) {
    it(`gives a row carrying a band the height of a row carrying a count at ${width}px`, async () => {
      // The quick choices are on every row whatever it carries, and a count
      // marking its band changes the border's style, never its width.
      await page.viewport(width, 800);

      const [banded, counted] = rowHeights([
        { species_uuid: MANTA.uuid, abundance: "abundant" },
        { species_uuid: CLOWNFISH.uuid, count: 37 },
      ]);

      expectLevel(banded, counted);
    });
  }
});
