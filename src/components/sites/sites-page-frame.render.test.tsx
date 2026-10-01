import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SitesPageFrame } from "./sites-page-frame";
import { NO_SITE_FILTERS } from "./sites-filters";

// The search sits behind the panel button with the tag and the order: it is
// reachable, shutting the panel empties all three, a list searched down to
// nothing is not an empty one, and a list that is empty draws neither the count
// nor the button.

const frame = (props: Partial<Parameters<typeof SitesPageFrame>[0]> = {}) =>
  render(
    <SitesPageFrame
      isLoading={false}
      totalCount={0}
      itemsPerPage={10}
      cards={[]}
      {...props}
    />,
  );

// The header is what the card's own (hidden) heading sits in.
const header = () =>
  screen.getByRole("heading", { name: "Dive Site List" }).parentElement!;

const SEARCH = "Search dive sites by name or location";

// One button under two names: it opens the panel, and once open it is the
// control that shuts it and empties what is in it.
const toggle = () =>
  screen.getByRole("button", {
    name: /^(Search, filter and sort dive sites|Close search and filters)/,
  });

describe("SitesPageFrame", () => {
  it("draws the sites as one list of cards", () => {
    frame({
      totalCount: 2,
      cards: [<li key="a">Blue Hole</li>, <li key="b">The Canyon</li>],
    });

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Blue Hole",
      "The Canyon",
    ]);
  });

  it("holds the list's place with placeholders while it loads", () => {
    frame({ isLoading: true, itemsPerPage: 4 });

    const list = screen.getByRole("list");
    expect(list).toHaveAttribute("aria-busy", "true");
    expect(list.querySelectorAll("li[aria-hidden]")).toHaveLength(4);
  });

  it("keeps the search shut behind the button, beside the count", async () => {
    frame({ totalCount: 12, cards: [<li key="t" />] });

    expect(
      within(header()).getByText("12 total dive sites"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(SEARCH)).not.toBeVisible();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle());

    expect(screen.getByLabelText(SEARCH)).toBeVisible();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  // Pressing a magnifier and then reaching for the box is a click nobody wanted.
  it("puts the cursor in the search box on opening, and again on re-opening", async () => {
    frame({ cards: [<li key="t" />] });

    await userEvent.click(toggle());
    expect(screen.getByLabelText(SEARCH)).toHaveFocus();

    await userEvent.click(toggle());
    await userEvent.click(toggle());
    expect(screen.getByLabelText(SEARCH)).toHaveFocus();
  });

  it("reports what is typed into it", async () => {
    const onSearchChange = vi.fn();
    frame({ onSearchChange, cards: [<li key="t" />] });

    await userEvent.click(toggle());
    await userEvent.type(screen.getByLabelText(SEARCH), "d");

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

  it("drops the count and the button for a list that is simply empty", () => {
    frame();

    expect(screen.queryByText("0 total dive sites")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Search, filter and sort/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(SEARCH)).not.toBeInTheDocument();
  });

  it("keeps them for a search that matched nothing", () => {
    frame({ search: "dahab", isSearching: true, isCountNarrowed: true });

    expect(
      within(header()).getByText("0 dive sites found"),
    ).toBeInTheDocument();
    expect(toggle()).toBeInTheDocument();
  });

  // The term is only asked for once the typing stops, so for a quarter second
  // the box holds one and `isSearching` does not. Reading the box as well is
  // what keeps it from vanishing under the diver mid-word.
  it("keeps them for a term still waiting on the debounce", () => {
    frame({ search: "dahab" });

    expect(toggle()).toBeInTheDocument();
    expect(screen.getByLabelText(SEARCH)).toBeInTheDocument();
  });

  // Emptying the box is the way out of a search that matched nothing, and for
  // one commit it leaves the term gone and the search's own (empty) cards still
  // on screen. Dropping the panel there would take the diver's cursor with it.
  it("keeps them through the commit where a cleared term outruns its cards", () => {
    const { rerender } = frame({ search: "dahab", isSearching: true });

    rerender(
      <SitesPageFrame
        isLoading={false}
        totalCount={0}
        itemsPerPage={10}
        cards={[]}
        search=""
        isSearching={false}
      />,
    );

    expect(screen.getByLabelText(SEARCH)).toBeInTheDocument();
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
  const openPanel = () => userEvent.click(toggle());

  it("reads the tags the first time the panel opens, and reports a tag and an order", async () => {
    const onFiltersOpened = vi.fn();
    const onFiltersChange = vi.fn();
    frame({
      cards: [<li key="t" />],
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
  it("clears the search, the tag and the order when the panel is shut", async () => {
    const onSearchChange = vi.fn();
    const onFiltersChange = vi.fn();
    frame({
      cards: [<li key="t" />],
      search: "dahab",
      filters: { tagUuid: "tag-wreck", sort: "dive_count" },
      onSearchChange,
      onFiltersChange,
    });

    await openPanel();
    expect(onSearchChange).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Close search and filters, clearing them",
      }),
    );

    expect(onSearchChange).toHaveBeenLastCalledWith("");
    expect(onFiltersChange).toHaveBeenLastCalledWith(NO_SITE_FILTERS);
  });

  // The name is the only warning that the press throws a term away, so it says
  // so exactly when there is something to lose.
  it("says it clears a search alone", async () => {
    const { rerender } = frame({ cards: [<li key="t" />], search: "dahab" });

    await openPanel();
    expect(
      screen.getByRole("button", {
        name: "Close search and filters, clearing them",
      }),
    ).toBeInTheDocument();

    rerender(
      <SitesPageFrame
        isLoading={false}
        totalCount={0}
        itemsPerPage={10}
        cards={[<li key="t" />]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Close search and filters" }),
    ).toBeInTheDocument();
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
});
