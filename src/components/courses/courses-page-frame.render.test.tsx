import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CoursesPageFrame } from "./courses-page-frame";
import { NO_COURSE_FILTERS } from "./courses-filters";

// The row is behind a button now, so what these pin is that it is reachable and
// that shutting it never hides the fact that the list is narrowed.

const frame = (props: Partial<Parameters<typeof CoursesPageFrame>[0]> = {}) =>
  render(
    <CoursesPageFrame
      isLoading={false}
      totalCount={0}
      itemsPerPage={10}
      rows={[]}
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
});
