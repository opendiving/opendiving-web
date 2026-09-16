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
