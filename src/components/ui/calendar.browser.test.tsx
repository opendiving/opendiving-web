import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { page } from "vitest/browser";

import { Calendar } from "./calendar";

// Load-bearing: the browser project renders no `app/layout.tsx`, so without this
// none of the Tailwind below computes and every box measures 0.
import "@/app/globals.css";

const NARROW = 393;
const WIDE = 1024;

// The two pickers that wrap `Calendar` both configure it this way, and the
// dropdown caption is the whole point of the assertion - an arrow has a row to
// share only when there are selects sitting in it.
function renderCalendar() {
  return render(
    <Calendar
      mode="single"
      captionLayout="dropdown"
      startMonth={new Date(1900, 0)}
      endMonth={new Date(2030, 11)}
      defaultMonth={new Date(2026, 3)}
      classNames={{ caption_label: "hidden" }}
    />,
  );
}

describe("the month arrows against the caption they steer", () => {
  // Where the arrows land is a browser's to measure, which is why this is here
  // and not in the jsdom lane: `getBoundingClientRect` is all zeroes there and
  // every assertion below would pass against the markup it exists to reject.
  // Both widths are checked because an absolute offset misses the caption at
  // one width while still hitting it at the other.
  it.each([
    ["narrow", NARROW],
    ["wide", WIDE],
  ])("sits both of them on the selects' row at %s width", async (_, width) => {
    await page.viewport(width, 800);
    const { getByRole, getByLabelText } = renderCalendar();

    const previous = getByLabelText(/previous month/i).getBoundingClientRect();
    const next = getByLabelText(/next month/i).getBoundingClientRect();
    const month = getByRole("combobox", {
      name: /month/i,
    }).getBoundingClientRect();
    const grid = getByRole("grid").getBoundingClientRect();

    const centerY = (box: DOMRect) => box.top + box.height / 2;

    // Same row as the selects, not the grid below them.
    expect(centerY(previous)).toBeCloseTo(centerY(month), 0);
    expect(centerY(next)).toBeCloseTo(centerY(month), 0);
    expect(previous.bottom).toBeLessThanOrEqual(grid.top);
    expect(next.bottom).toBeLessThanOrEqual(grid.top);

    // Flanking them in flow rather than overlapping, which is what an absolute
    // offset stops guaranteeing as soon as the caption grows.
    expect(previous.right).toBeLessThanOrEqual(month.left);
    expect(next.left).toBeGreaterThanOrEqual(month.right);
  });
});

// The grid follows the finger and slides between months, and none of it is a
// question jsdom can answer: it lays nothing out, so `offsetWidth` is 0 and
// every offset computes to 0, and it implements no Web Animations API at all.
describe("the grid sliding between months", () => {
  const TOUCH = {
    pointerType: "touch",
    pointerId: 1,
    isPrimary: true,
    bubbles: true,
    cancelable: true,
  };

  function finger(el: Element, type: string, x: number, y = 300) {
    el.dispatchEvent(
      new PointerEvent(type, { ...TOUCH, clientX: x, clientY: y }),
    );
  }

  // The months either side are mounted only while one is moving, so the track
  // holding them is also the thing that carries the transform.
  const track = (grid: Element) => grid.parentElement as HTMLElement;

  const atRest = (grid: Element) =>
    expect
      .poll(() => {
        const el = track(grid);
        return el.getAnimations().length === 0 && !el.getAttribute("style");
      })
      .toBe(true);

  /** Every month grid on the page, the one on screen and its neighbours. */
  const grids = (grid: Element) =>
    [...track(grid).querySelectorAll("table")].map((el) =>
      el.getBoundingClientRect(),
    );

  it("follows the finger, and goes back when the drag falls short", async () => {
    await page.viewport(NARROW, 800);
    const { getByRole } = renderCalendar();
    const grid = getByRole("grid");
    const home = grid.getBoundingClientRect().left;

    finger(grid, "pointerdown", 200);
    finger(grid, "pointermove", 170);
    expect(grid.getBoundingClientRect().left).toBeCloseTo(home - 30, 0);

    finger(grid, "pointerup", 170);
    await atRest(grid);
    expect(grid.getBoundingClientRect().left).toBeCloseTo(home, 0);
    expect(grid.getAttribute("aria-label")).toMatch(/April 2026/);
  });

  // The whole point of the track: what follows the finger into view is the
  // month being pulled in, not the gap where it will eventually be.
  it("keeps the neighbouring months waiting either side while it moves", async () => {
    await page.viewport(NARROW, 800);
    const { getByRole } = renderCalendar();
    const grid = getByRole("grid");

    expect(grids(grid)).toHaveLength(1);

    finger(grid, "pointerdown", 200);
    finger(grid, "pointermove", 140);

    // They are mounted by the render the drag schedules, not by the event.
    await expect.poll(() => grids(grid).length).toBe(3);

    const [before, shown, after] = grids(grid).sort((a, b) => a.left - b.left);
    expect(before.right).toBeCloseTo(shown.left, 0);
    expect(shown.right).toBeCloseTo(after.left, 0);

    finger(grid, "pointerup", 140);
    await atRest(grid);
    expect(grids(grid)).toHaveLength(1);
  });

  it("carries the month off the edge and brings the next one back", async () => {
    await page.viewport(NARROW, 800);
    const { getByRole } = renderCalendar();
    const grid = getByRole("grid");
    const home = grid.getBoundingClientRect().left;

    finger(grid, "pointerdown", 200);
    finger(grid, "pointermove", 80);
    finger(grid, "pointerup", 80);

    // Leaving to the left, since the month arriving is the later one.
    await expect
      .poll(() => grid.getBoundingClientRect().left < home - 30)
      .toBe(true);

    await atRest(grid);
    expect(grid.getBoundingClientRect().left).toBeCloseTo(home, 0);
    expect(grid.getAttribute("aria-label")).toMatch(/May 2026/);
  });

  it("slides for the arrows too, which have no finger to follow", async () => {
    await page.viewport(NARROW, 800);
    const { getByLabelText, getByRole } = renderCalendar();
    const grid = getByRole("grid");
    const home = grid.getBoundingClientRect().left;

    getByLabelText(/next month/i).click();

    // The new month starts off the right edge and comes back.
    await expect
      .poll(() => grid.getBoundingClientRect().left > home + 30)
      .toBe(true);

    await atRest(grid);
    expect(grid.getBoundingClientRect().left).toBeCloseTo(home, 0);
    expect(grid.getAttribute("aria-label")).toMatch(/May 2026/);
  });
});
