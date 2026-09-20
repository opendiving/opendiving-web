import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CoursesPageFrame } from "./courses-page-frame";
import { NO_COURSE_FILTERS } from "./courses-filters";

// The row is behind a button now, so what these pin is that it is reachable,
// that shutting it never hides the fact that the list is narrowed, and that a
// list with nothing in it to narrow draws neither the button nor the count.

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

const toggle = () =>
  screen.getByRole("button", { name: /^Search and filter courses/ });

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

  // A shut panel that is still narrowing the list is the failure the dot and
  // this name exist for: the button is the only thing left on screen saying so.
  it("says so when a shut panel is still narrowing the list", () => {
    frame({ filters: { ...NO_COURSE_FILTERS, agency: "padi" } });

    expect(
      screen.getByRole("button", {
        name: "Search and filter courses, narrowing the list",
      }),
    ).toBeInTheDocument();
  });

  it("says so for a search term as well as a filter", () => {
    frame({ search: "nitrox" });

    expect(
      screen.getByRole("button", {
        name: "Search and filter courses, narrowing the list",
      }),
    ).toBeInTheDocument();
  });

  it("does not claim narrowing on an untouched list", () => {
    frame();

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
