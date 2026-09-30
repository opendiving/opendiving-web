import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DivesPageFrame } from "./dives-page-frame";
import { NO_DIVE_FILTERS } from "./dives-filters";

// The courses list's panel, pinned the same way: it is reachable, shutting it
// takes the filters with it rather than leaving a folded row narrowing the list
// unseen, and a list filtered to nothing says so in one line rather than as an
// empty logbook.

const frame = (props: Partial<Parameters<typeof DivesPageFrame>[0]> = {}) =>
  render(
    <DivesPageFrame
      isLoading={false}
      totalCount={0}
      itemsPerPage={10}
      rows={[<tr key="d" />]}
      {...props}
    />,
  );

const toggle = () =>
  screen.getByRole("button", {
    name: /^(Filter and sort dives|Close filters)/,
  });

describe("DivesPageFrame", () => {
  it("offers Import beside Log new dive in its header", () => {
    frame();

    expect(screen.getByRole("link", { name: "Import" })).toHaveAttribute(
      "href",
      "/import",
    );
    expect(screen.getByRole("link", { name: "Log new dive" })).toHaveAttribute(
      "href",
      "/dives/new",
    );
  });

  it("keeps the filters shut until the button is pressed", async () => {
    frame();

    expect(screen.getByLabelText("Tag")).not.toBeVisible();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle());

    expect(screen.getByLabelText("Tag")).toBeVisible();
    expect(screen.getByLabelText("Dive type")).toBeVisible();
    expect(screen.getByLabelText("Sort")).toBeVisible();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  it("clears every filter and the sort as it shuts, and says so while there is something to clear", async () => {
    const onFiltersChange = vi.fn();
    frame({
      filters: { ...NO_DIVE_FILTERS, sort: "rating" },
      onFiltersChange,
    });

    await userEvent.click(toggle());
    expect(onFiltersChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Close filters, clearing them" }),
    ).toBeInTheDocument();

    await userEvent.click(toggle());
    expect(onFiltersChange).toHaveBeenCalledWith(NO_DIVE_FILTERS);
  });

  it("says only that it closes when nothing is set", async () => {
    frame();

    await userEvent.click(toggle());

    expect(
      screen.getByRole("button", { name: "Close filters" }),
    ).toBeInTheDocument();
  });

  // The diver's tags are read off the back of this, so a visit that never opens
  // the panel never asks for them.
  it("says when the panel is opened, and not when it is shut again", async () => {
    const onFiltersOpened = vi.fn();
    frame({ onFiltersOpened });

    await userEvent.click(toggle());
    await userEvent.click(toggle());

    expect(onFiltersOpened).toHaveBeenCalledTimes(1);
  });

  it("offers the tags it is handed", async () => {
    frame({
      tags: [
        {
          uuid: "tag-night",
          name: "night",
          dive_count: 2,
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    });

    await userEvent.click(toggle());

    expect(
      [...screen.getByLabelText<HTMLSelectElement>("Tag").options].map(
        (option) => option.text,
      ),
    ).toEqual(["Any tag", "night"]);
  });

  it("answers a filter that matched nothing in one line, keeping the count and the button", () => {
    frame({ rows: [], filters: { ...NO_DIVE_FILTERS, type: "snorkel" } });

    expect(
      screen.getByText("No dives match those filters."),
    ).toBeInTheDocument();
    expect(screen.getByText("0 total dives")).toBeInTheDocument();
    expect(toggle()).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /log your first dive/i }),
    ).not.toBeInTheDocument();
  });

  it("shows an empty logbook as one, with no button to filter nothing", () => {
    frame({ rows: [] });

    expect(screen.getByText("No dives logged yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Filter and sort dives/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tag")).not.toBeInTheDocument();
  });

  // Sorting orders every dive, so an empty list sorted by rating is still an
  // empty logbook.
  it("reads an empty list sorted by rating as an empty logbook", () => {
    frame({ rows: [], filters: { ...NO_DIVE_FILTERS, sort: "rating" } });

    expect(screen.getByText("No dives logged yet")).toBeInTheDocument();
  });
});
