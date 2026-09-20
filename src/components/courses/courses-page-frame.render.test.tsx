import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CoursesPageFrame } from "./courses-page-frame";
import { NO_COURSE_FILTERS } from "./courses-filters";

// The row is behind a button now, so what these pin is that it is reachable,
// that shutting it takes the search and the filters with it rather than
// leaving a folded row narrowing the list unannounced, and that a list with
// nothing in it to narrow draws neither the button nor the count.

const frame = (props: Partial<Parameters<typeof CoursesPageFrame>[0]> = {}) =>
  render(
    <CoursesPageFrame
      isLoading={false}
      totalCount={0}
      itemsPerPage={10}
      rows={[<tr key="t" />]}
      {...props}
    />,
  );

// One button under two names: it opens the panel, and once open it is the
// control that shuts it and empties what is in it.
const toggle = () =>
  screen.getByRole("button", {
    name: /^(Search and filter courses|Close search and filters)/,
  });

describe("CoursesPageFrame", () => {
  it("keeps the search and filters shut until the button is pressed", async () => {
    frame();

    expect(screen.getByLabelText("Search courses by name")).not.toBeVisible();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle());

    expect(screen.getByLabelText("Search courses by name")).toBeVisible();
    expect(screen.getByLabelText("Agency")).toBeVisible();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  it("shuts again on a second press", async () => {
    frame();

    await userEvent.click(toggle());
    await userEvent.click(toggle());

    expect(screen.getByLabelText("Agency")).not.toBeVisible();
  });

  // A shut panel that is still narrowing the list is the failure this costs, and
  // emptying it on the way out is what rules the state out rather than a badge
  // on the button.
  it("clears the search and every filter as it shuts", async () => {
    const onSearchChange = vi.fn();
    const onFiltersChange = vi.fn();
    frame({
      search: "nitrox",
      filters: { ...NO_COURSE_FILTERS, agency: "padi" },
      onSearchChange,
      onFiltersChange,
    });

    await userEvent.click(toggle());
    expect(onSearchChange).not.toHaveBeenCalled();
    expect(onFiltersChange).not.toHaveBeenCalled();

    await userEvent.click(toggle());
    expect(onSearchChange).toHaveBeenCalledWith("");
    expect(onFiltersChange).toHaveBeenCalledWith(NO_COURSE_FILTERS);
  });

  // The name is the only warning the diver gets that the press throws a term and
  // four filters away, so it says so exactly when there is something to lose.
  it("says it clears, and only while there is something to clear", async () => {
    const { rerender } = frame({ search: "nitrox" });

    await userEvent.click(toggle());
    expect(
      screen.getByRole("button", {
        name: "Close search and filters, clearing them",
      }),
    ).toBeInTheDocument();

    rerender(
      <CoursesPageFrame
        isLoading={false}
        totalCount={0}
        itemsPerPage={10}
        rows={[<tr key="t" />]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Close search and filters" }),
    ).toBeInTheDocument();
  });

  it("says what it opens while it is shut", () => {
    frame({ search: "nitrox" });

    expect(
      screen.getByRole("button", { name: "Search and filter courses" }),
    ).toBeInTheDocument();
  });

  // The vocabulary behind the two selects is read off the back of this, so a
  // visit that never opens the panel never asks for it.
  it("says when the panel is opened, and not when it is shut again", async () => {
    const onFiltersOpened = vi.fn();
    frame({ onFiltersOpened });

    expect(onFiltersOpened).not.toHaveBeenCalled();

    await userEvent.click(toggle());
    expect(onFiltersOpened).toHaveBeenCalledTimes(1);

    await userEvent.click(toggle());
    expect(onFiltersOpened).toHaveBeenCalledTimes(1);
  });

  it("offers only the agencies it is handed", async () => {
    frame({ agencies: ["padi"] });

    await userEvent.click(toggle());

    expect(
      [...screen.getByLabelText<HTMLSelectElement>("Agency").options].map(
        (option) => option.text,
      ),
    ).toEqual(["Any agency", "PADI"]);
  });

  it("drops the count and the button for a list that is simply empty", () => {
    frame({ rows: [] });

    expect(screen.queryByText("0 total courses")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Search and filter courses/ }),
    ).not.toBeInTheDocument();
    // The panel goes with the button that opens it - a row of selects nothing
    // on screen can shut again is worse than no row at all.
    expect(
      screen.queryByLabelText("Search courses by name"),
    ).not.toBeInTheDocument();
  });

  it("keeps them for filters that matched nothing", () => {
    frame({ rows: [], filters: { ...NO_COURSE_FILTERS, agency: "padi" } });

    expect(screen.getByText("0 total courses")).toBeInTheDocument();
    expect(toggle()).toBeInTheDocument();
  });

  it("keeps them for a search that matched nothing", () => {
    frame({ rows: [], search: "nitrox", isSearching: true });

    expect(screen.getByText("0 total courses")).toBeInTheDocument();
    expect(toggle()).toBeInTheDocument();
  });

  // Emptying the box is the way out of a search that matched nothing, and for
  // one commit it leaves the term gone and the search's own (empty) rows still
  // on screen. Dropping the panel there would take the diver's cursor with it.
  it("keeps them through the commit where a cleared term outruns its rows", () => {
    const { rerender } = frame({
      rows: [],
      search: "nitrox",
      isSearching: true,
    });

    rerender(
      <CoursesPageFrame
        isLoading={false}
        totalCount={0}
        itemsPerPage={10}
        rows={[]}
        search=""
        isSearching={false}
      />,
    );

    expect(toggle()).toBeInTheDocument();
  });

  // Pressing a magnifier and then reaching for the box is a click nobody wanted.
  it("puts the cursor in the search box on opening, and again on re-opening", async () => {
    frame();

    await userEvent.click(toggle());
    expect(screen.getByLabelText("Search courses by name")).toHaveFocus();

    await userEvent.click(toggle());
    await userEvent.click(toggle());
    expect(screen.getByLabelText("Search courses by name")).toHaveFocus();
  });
});
