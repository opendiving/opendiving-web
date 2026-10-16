import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { page } from "vitest/browser";

import { DiveActivityCard } from "./dive-activity-card";
import { HERO_BODY } from "@/components/ui/map-hero";
import { availablePeriods } from "@/lib/chart-period";
import type { ChartPeriodState } from "@/hooks/useChartPeriodView";

// Load-bearing: the browser project renders no `app/layout.tsx`, so without this
// none of the Tailwind below computes and every box measures 0.
import "@/app/globals.css";

// A month with diving either side of it, so both arrows show and the stepper is
// as wide as it gets. `points` stays null: the card's header is the subject, and
// its chart waits behind a skeleton.
const view = vi.hoisted(() => {
  const august = Date.UTC(2026, 7, 9);
  const september = Date.UTC(2026, 8, 15);
  const october = Date.UTC(2026, 9, 3);
  return {
    points: null,
    times: [august, september, october],
    scope: "month",
    setScope: () => {},
    anchor: september,
    setAnchor: () => {},
    previous: august,
    next: october,
    periods: [],
  } as unknown as ChartPeriodState<unknown>;
});
view.periods = availablePeriods(view.times, "month");

vi.mock("@/hooks/useChartPeriodView", () => ({
  useChartPeriodView: () => view,
}));

// In Home's column, which is what leaves the card its width.
function renderCard() {
  render(
    <div className={HERO_BODY}>
      <DiveActivityCard />
    </div>,
  );
  return {
    picker: screen.getByRole("combobox", { name: "Dive activity: period" }),
    next: screen.getByRole("button", {
      name: "Dive activity: next period with dives",
    }),
  };
}

describe("a Home chart card's period stepper", () => {
  it("fits a 320px phone on its own line", async () => {
    await page.viewport(320, 640);
    const { next } = renderCard();

    expect(next.getBoundingClientRect().right).toBeLessThanOrEqual(
      window.innerWidth,
    );
    expect(document.documentElement.scrollWidth).toBe(window.innerWidth);
  });

  it("keeps its picker at the wrapped width where the card has room", async () => {
    await page.viewport(375, 640);
    const { picker } = renderCard();

    expect(picker.getBoundingClientRect().width).toBe(224);
  });
});
