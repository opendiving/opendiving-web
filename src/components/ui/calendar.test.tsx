import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Calendar } from "./calendar";

// On a phone the two month arrows are the smallest targets on the screen, so the
// day grid takes a sideways drag as a page turn. What these pin is the seam
// between that gesture and a tap: the grid is also where days are picked, and
// the browser fires a click at the end of a swipe like it does at the end of a
// tap. The sliding itself is a browser's to show - `calendar.browser.test.tsx`
// is where that is measured.

const APRIL_2026 = new Date(2026, 3, 1);

// Comfortably past the threshold a page turn asks for, and the same either way.
const FAR = 120;

const TOUCH = {
  clientX: 200,
  clientY: 300,
  pointerId: 1,
  pointerType: "touch",
};

function renderCalendar(onSelect = vi.fn()) {
  render(
    <Calendar mode="single" defaultMonth={APRIL_2026} onSelect={onSelect} />,
  );
  return { grid: screen.getByRole("grid"), onSelect };
}

const shownMonth = () => screen.getByRole("grid").getAttribute("aria-label");

/**
 * Lets every leg of a page turn run. Each resolves on an already-settled
 * promise under the `Element.animate` stub, so one macrotask boundary drains
 * the sequence however many legs it has.
 */
async function turned() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** One finger down, across and up, all of it over the day grid. */
async function swipe(
  grid: HTMLElement,
  dx: number,
  { dy = 0, pointerType = "touch" } = {},
) {
  const from = { ...TOUCH, pointerType };
  const to = {
    ...from,
    clientX: from.clientX + dx,
    clientY: from.clientY + dy,
  };
  fireEvent.pointerDown(grid, from);
  fireEvent.pointerMove(grid, to);
  fireEvent.pointerUp(grid, to);
  await turned();
}

describe("paging the calendar by swiping the day grid", () => {
  it("shows the next month when the grid is dragged left", async () => {
    const { grid } = renderCalendar();

    await swipe(grid, -FAR);

    expect(shownMonth()).toMatch(/May 2026/);
  });

  it("shows the previous month when the grid is dragged right", async () => {
    const { grid } = renderCalendar();

    await swipe(grid, FAR);

    expect(shownMonth()).toMatch(/March 2026/);
  });

  it("leaves the month alone for a drag that never crosses the threshold", async () => {
    const { grid } = renderCalendar();

    await swipe(grid, -20);

    expect(shownMonth()).toMatch(/April 2026/);
  });

  // Either sign, because a scroll reaching past the calendar can go either way.
  it.each([
    ["up", -(FAR + 40)],
    ["down", FAR + 40],
  ])(
    "leaves the month alone for a drag that went further %s than across",
    async (_, dy) => {
      const { grid } = renderCalendar();

      await swipe(grid, -FAR, { dy });

      expect(shownMonth()).toMatch(/April 2026/);
    },
  );

  it("ignores a mouse dragged across the grid, which is a selection", async () => {
    const { grid } = renderCalendar();

    await swipe(grid, -FAR, { pointerType: "mouse" });

    expect(shownMonth()).toMatch(/April 2026/);
  });

  it("stays put when the finger comes back before lifting", async () => {
    const { grid } = renderCalendar();

    fireEvent.pointerDown(grid, TOUCH);
    fireEvent.pointerMove(grid, { ...TOUCH, clientX: TOUCH.clientX - FAR });
    fireEvent.pointerUp(grid, { ...TOUCH, clientX: TOUCH.clientX - 10 });
    await turned();

    expect(shownMonth()).toMatch(/April 2026/);
  });

  it("does not also pick the day the finger lifted from", async () => {
    const { grid, onSelect } = renderCalendar();

    await swipe(grid, -FAR);

    // The browser's own doing: a touch that lifts over a button clicks it,
    // whether or not it travelled first. It is read after the swipe on purpose -
    // the grid has already been repainted with the month the drag asked for, so
    // the cell under that finger is one of the new month's.
    fireEvent.click(screen.getByRole("button", { name: /15th, 2026/ }));

    expect(shownMonth()).toMatch(/May 2026/);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("still picks the day a plain tap lifted from", async () => {
    const { grid, onSelect } = renderCalendar();
    const day = screen.getByRole("button", { name: /15th, 2026/ });

    await swipe(grid, 0);
    fireEvent.click(day);

    expect(onSelect).toHaveBeenCalledOnce();
  });

  // The arrows and the dropdowns page through the same animated arrival the
  // swipe hands off to, so a mistake in it takes them with it.
  it("leaves the arrows paging the month as they did", async () => {
    renderCalendar();

    await userEvent.click(screen.getByLabelText(/next month/i));
    await turned();
    expect(shownMonth()).toMatch(/May 2026/);

    await userEvent.click(screen.getByLabelText(/previous month/i));
    await turned();
    expect(shownMonth()).toMatch(/April 2026/);
  });
});
