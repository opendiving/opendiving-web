import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Calendar } from "./calendar";

// On a phone the two month arrows are the smallest targets on the screen, so the
// day grid takes a sideways drag as a page turn. What these pin is the seam
// between that gesture and a tap: the grid is also where days are picked, and
// the browser fires a click at the end of a swipe like it does at the end of a
// tap.

const APRIL_2026 = new Date(2026, 3, 1);

// Comfortably past `SWIPE_THRESHOLD_PX`, and the same distance either way.
const FAR = 120;

function renderCalendar(onSelect = vi.fn()) {
  render(
    <Calendar mode="single" defaultMonth={APRIL_2026} onSelect={onSelect} />,
  );
  return { grid: screen.getByRole("grid"), onSelect };
}

const shownMonth = () => screen.getByRole("grid").getAttribute("aria-label");

/** One finger down, across and up, all of it over the day grid. */
function swipe(
  grid: HTMLElement,
  dx: number,
  { dy = 0, pointerType = "touch" } = {},
) {
  const from = { clientX: 200, clientY: 300, pointerId: 1, pointerType };
  fireEvent.pointerDown(grid, from);
  fireEvent.pointerMove(grid, {
    ...from,
    clientX: from.clientX + dx,
    clientY: from.clientY + dy,
  });
  fireEvent.pointerUp(grid, {
    ...from,
    clientX: from.clientX + dx,
    clientY: from.clientY + dy,
  });
}

describe("paging the calendar by swiping the day grid", () => {
  it("shows the next month when the grid is dragged left", () => {
    const { grid } = renderCalendar();

    swipe(grid, -FAR);

    expect(shownMonth()).toMatch(/May 2026/);
  });

  it("shows the previous month when the grid is dragged right", () => {
    const { grid } = renderCalendar();

    swipe(grid, FAR);

    expect(shownMonth()).toMatch(/March 2026/);
  });

  it("leaves the month alone for a drag that never crosses the threshold", () => {
    const { grid } = renderCalendar();

    swipe(grid, -20);

    expect(shownMonth()).toMatch(/April 2026/);
  });

  // Either sign, because a scroll reaching past the calendar can go either way.
  it.each([
    ["up", -(FAR + 40)],
    ["down", FAR + 40],
  ])(
    "leaves the month alone for a drag that went further %s than across",
    (_, dy) => {
      const { grid } = renderCalendar();

      swipe(grid, -FAR, { dy });

      expect(shownMonth()).toMatch(/April 2026/);
    },
  );

  it("ignores a mouse dragged across the grid, which is a selection", () => {
    const { grid } = renderCalendar();

    swipe(grid, -FAR, { pointerType: "mouse" });

    expect(shownMonth()).toMatch(/April 2026/);
  });

  it("stays put when the finger comes back before lifting", () => {
    const { grid } = renderCalendar();

    const from = {
      clientX: 200,
      clientY: 300,
      pointerId: 1,
      pointerType: "touch",
    };
    fireEvent.pointerDown(grid, from);
    fireEvent.pointerMove(grid, { ...from, clientX: from.clientX - FAR });
    fireEvent.pointerUp(grid, { ...from, clientX: from.clientX - 10 });

    expect(shownMonth()).toMatch(/April 2026/);
  });

  it("does not also pick the day the finger lifted from", () => {
    const { grid, onSelect } = renderCalendar();

    swipe(grid, -FAR);

    // The browser's own doing: a touch that lifts over a button clicks it,
    // whether or not it travelled first. It is read after the swipe on purpose -
    // the grid has already been repainted with the month the drag asked for, so
    // the cell under that finger is one of the new month's.
    fireEvent.click(screen.getByRole("button", { name: /15th, 2026/ }));

    expect(shownMonth()).toMatch(/May 2026/);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("still picks the day a plain tap lifted from", () => {
    const { grid, onSelect } = renderCalendar();
    const day = screen.getByRole("button", { name: /15th, 2026/ });

    swipe(grid, 0);
    fireEvent.click(day);

    expect(onSelect).toHaveBeenCalledOnce();
  });
});
