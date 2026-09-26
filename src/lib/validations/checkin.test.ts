import { describe, expect, it } from "vitest";

import { SHARED_DIVE_COUNT_MAX, divingFiguresSchema } from "./checkin";

const figures = (totalDives: number) => ({
  total_dives: totalDives,
  max_depth: 30,
  last_dive_on: "",
});

describe("divingFiguresSchema", () => {
  // The one bound the dialog shares with the API: a count a link cannot store is
  // refused here, rather than by the mint after the diver has pressed Share.
  it("takes a count up to the link's own ceiling and not past it", () => {
    expect(SHARED_DIVE_COUNT_MAX).toBe(2147483647);
    expect(
      divingFiguresSchema.safeParse(figures(SHARED_DIVE_COUNT_MAX)).success,
    ).toBe(true);
    expect(
      divingFiguresSchema.safeParse(figures(SHARED_DIVE_COUNT_MAX + 1)).success,
    ).toBe(false);
  });

  it("still holds the date to a day that has happened, which the API does not", () => {
    const tomorrow = new Date(Date.now() + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(
      divingFiguresSchema.safeParse({ ...figures(1), last_dive_on: tomorrow })
        .success,
    ).toBe(false);
  });
});
