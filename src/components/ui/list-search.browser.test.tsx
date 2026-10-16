import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render } from "@testing-library/react";
import { page } from "vitest/browser";
import userEvent from "@testing-library/user-event";

import { ListSearch } from "./list-search";

// **Load-bearing, and it looks like a stray import** - the same one the other
// browser tests here carry. Without the stylesheet `hidden`, `sm:block` and
// `sm:hidden` compute to nothing, both halves are drawn at every width, and the
// file passes against exactly the markup it exists to reject.
import "@/app/globals.css";

// The claim is a width: a count badge and a 16rem field do not share a phone's
// line, so under `sm` the field folds behind a button. jsdom answers no layout
// question and would only re-state the `className`, which is why this is here.
//
// 640px is Tailwind's `sm`. The wide case is not decoration - "fixing" a cramped
// phone row by folding the box away on a desktop too would pass the narrow half
// on its own.
const NARROW = 393;
const WIDE = 1024;

// `display: none` on the wrapper leaves the field's *own* computed display
// untouched, so the question is whether the thing is rendered at all rather than
// what it says it is.
const isDrawn = (element: Element) => element.checkVisibility();

function control(value = "") {
  const { container } = render(
    <ListSearch
      id="thing-search"
      label="Search things by name"
      toggleLabel="Search things"
      value={value}
      onChange={vi.fn()}
    />,
  );

  return {
    // By attribute rather than by role and name: a `display: none` control has
    // no accessible name to be found by, which is the state half of this file
    // is about.
    toggle: container.querySelector<HTMLElement>("button[aria-controls]")!,
    box: container.querySelector<HTMLElement>("#thing-search")!,
  };
}

describe("ListSearch across the breakpoint", () => {
  it("folds the box behind the button on a phone, and opens it on a press", async () => {
    await page.viewport(NARROW, 700);
    const { toggle, box } = control();

    expect(isDrawn(toggle)).toBe(true);
    expect(isDrawn(box)).toBe(false);

    await userEvent.click(toggle);

    expect(isDrawn(box)).toBe(true);
  });

  it("shows the box itself from sm up, with no button in the row", async () => {
    await page.viewport(WIDE, 700);
    const { toggle, box } = control();

    expect(isDrawn(box)).toBe(true);
    expect(isDrawn(toggle)).toBe(false);
  });
});

// A list with filters as well: the box still folds on a phone, but the button
// that folds it takes the filters too, and from `sm` up the box stands alone
// beside a funnel folding the filters.
function Filtered() {
  const [isOpen, setOpen] = useState(false);

  return (
    <>
      <ListSearch
        id="thing-search"
        label="Search things by name"
        toggleLabel="Search and filter things"
        value=""
        onChange={vi.fn()}
        filters={{
          controls: "thing-filters",
          isOpen,
          onOpenChange: setOpen,
          onClear: vi.fn(),
          isChanged: false,
          label: "Filter things",
        }}
      />
      <div id="thing-filters" hidden={!isOpen}>
        filters
      </div>
    </>
  );
}

function filtered() {
  const { container } = render(<Filtered />);
  const buttons = [
    ...container.querySelectorAll<HTMLElement>("button[aria-controls]"),
  ];

  return {
    magnifier: buttons.find((button) =>
      button.getAttribute("aria-controls")!.includes("thing-search"),
    )!,
    funnel: buttons.find(
      (button) => button.getAttribute("aria-controls") === "thing-filters",
    )!,
    box: container.querySelector<HTMLElement>("#thing-search")!,
    panel: container.querySelector<HTMLElement>("#thing-filters")!,
  };
}

describe("ListSearch with filters across the breakpoint", () => {
  it("folds the box and the filters behind one button on a phone", async () => {
    await page.viewport(NARROW, 700);
    const { magnifier, funnel, box, panel } = filtered();

    expect(isDrawn(magnifier)).toBe(true);
    expect(isDrawn(funnel)).toBe(false);
    expect(isDrawn(box)).toBe(false);
    expect(isDrawn(panel)).toBe(false);

    await userEvent.click(magnifier);

    expect(isDrawn(box)).toBe(true);
    expect(isDrawn(panel)).toBe(true);
  });

  it("shows the box from sm up, and folds only the filters behind the funnel", async () => {
    await page.viewport(WIDE, 700);
    const { magnifier, funnel, box, panel } = filtered();

    expect(isDrawn(box)).toBe(true);
    expect(isDrawn(magnifier)).toBe(false);
    expect(isDrawn(funnel)).toBe(true);
    expect(isDrawn(panel)).toBe(false);

    await userEvent.click(funnel);

    expect(isDrawn(panel)).toBe(true);
    expect(isDrawn(box)).toBe(true);
  });
});
