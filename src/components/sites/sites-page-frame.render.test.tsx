import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SitesPageFrame } from "./sites-page-frame";
import { NO_SITE_FILTERS } from "./sites-filters";

// Three things the search costs the frame: the box shares the card's header row
// with the count, a list searched down to nothing is not an empty one, and a
// list that is empty has neither to show.

const frame = (props: Partial<Parameters<typeof SitesPageFrame>[0]> = {}) =>
  render(
    <SitesPageFrame
      isLoading={false}
      totalCount={0}
      itemsPerPage={10}
      rows={[]}
      {...props}
    />,
  );

// The header is what the card's own (hidden) heading sits in.
const header = () =>
  screen.getByRole("heading", { name: "Dive Site List" }).parentElement!;

describe("SitesPageFrame", () => {
  it("puts the search box in the header row, beside the count", () => {
    frame({ totalCount: 12, rows: [<tr key="t" />] });

    expect(
      within(header()).getByText("12 total dive sites"),
    ).toBeInTheDocument();
    expect(
      within(header()).getByLabelText("Search dive sites by name or location"),
    ).toBeInTheDocument();
  });

  it("reports what is typed into it", async () => {
    const onSearchChange = vi.fn();
    frame({ onSearchChange, rows: [<tr key="t" />] });

    await userEvent.type(
      screen.getByLabelText("Search dive sites by name or location"),
      "d",
    );

    expect(onSearchChange).toHaveBeenCalledWith("d");
  });

  it("says a searched list matched nothing, and offers nothing to add", () => {
    frame({ search: "dahab", isSearching: true });

    expect(
      screen.getByText("No dive sites match that name or location."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add your first dive site/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the first-site invitation for a list that is simply empty", () => {
    frame();

    expect(screen.getByText("No dive sites yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add your first dive site/ }),
    ).toBeInTheDocument();
  });

  it("drops the count and the box for a list that is simply empty", () => {
    frame();

    expect(screen.queryByText("0 total dive sites")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Search dive sites by name or location"),
    ).not.toBeInTheDocument();
  });

  it("keeps them for a search that matched nothing", () => {
    frame({ search: "dahab", isSearching: true, isCountNarrowed: true });

    expect(
      within(header()).getByText("0 dive sites found"),
    ).toBeInTheDocument();
    expect(
      within(header()).getByLabelText("Search dive sites by name or location"),
    ).toBeInTheDocument();
  });

  // The term is only asked for once the typing stops, so for a quarter second
  // the box holds one and `isSearching` does not. Reading the box as well is
  // what keeps it from vanishing under the diver mid-word.
  it("keeps them for a term still waiting on the debounce", () => {
    frame({ search: "dahab" });

    expect(
      within(header()).getByLabelText("Search dive sites by name or location"),
    ).toBeInTheDocument();
  });

  // Emptying the box is the way out of a search that matched nothing, and for
  // one commit it leaves the term gone and the search's own (empty) rows still
  // on screen. Dropping the box there would take the diver's cursor with it.
  it("keeps them through the commit where a cleared term outruns its rows", () => {
    const { rerender } = frame({ search: "dahab", isSearching: true });

    rerender(
      <SitesPageFrame
        isLoading={false}
        totalCount={0}
        itemsPerPage={10}
        rows={[]}
        search=""
        isSearching={false}
      />,
    );

    expect(
      within(header()).getByLabelText("Search dive sites by name or location"),
    ).toBeInTheDocument();
  });
});

describe("SitesPageFrame filters", () => {
  const TAGS = [
    {
      uuid: "tag-wreck",
      name: "wreck",
      dive_count: 4,
      site_count: 2,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
  const openPanel = () =>
    userEvent.click(
      screen.getByRole("button", { name: "Filter and sort dive sites" }),
    );

  it("reads the tags the first time the panel opens, and reports a tag and an order", async () => {
    const onFiltersOpened = vi.fn();
    const onFiltersChange = vi.fn();
    frame({
      rows: [<tr key="t" />],
      tags: TAGS,
      onFiltersOpened,
      onFiltersChange,
    });

    await openPanel();
    expect(onFiltersOpened).toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText("Tag"), "tag-wreck");
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      ...NO_SITE_FILTERS,
      tagUuid: "tag-wreck",
    });
    await userEvent.selectOptions(
      screen.getByLabelText("Sort"),
      "Most recently dived first",
    );
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      ...NO_SITE_FILTERS,
      sort: "last_dived_on",
    });
  });

  // A folded row must never narrow or reorder the list unseen.
  it("clears the tag and the order when the panel is shut", async () => {
    const onFiltersChange = vi.fn();
    frame({
      rows: [<tr key="t" />],
      filters: { tagUuid: "tag-wreck", sort: "dive_count" },
      onFiltersChange,
    });

    await openPanel();
    await userEvent.click(
      screen.getByRole("button", { name: "Close filters, clearing them" }),
    );

    expect(onFiltersChange).toHaveBeenLastCalledWith(NO_SITE_FILTERS);
  });

  it("says a list filtered by a tag matched nothing, and offers nothing to add", () => {
    frame({ filters: { tagUuid: "tag-wreck", sort: "name" } });

    expect(
      screen.getByText("No dive sites match those filters."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add your first dive site/ }),
    ).not.toBeInTheDocument();
  });

  it("heads a column for each site's dives and its last dive", () => {
    frame({ totalCount: 1, rows: [<tr key="t" />] });

    expect(
      screen.getByRole("columnheader", { name: "Dives" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Last dive" }),
    ).toBeInTheDocument();
  });
});
