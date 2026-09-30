import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TripsPageFrame } from "./trips-page-frame";

// Three things the search costs the frame: the box shares the card's header row
// with the count, a list searched down to nothing is not an empty logbook, and a
// list that is empty has neither to show.

const frame = (props: Partial<Parameters<typeof TripsPageFrame>[0]> = {}) =>
  render(
    <TripsPageFrame
      isLoading={false}
      totalCount={0}
      itemsPerPage={10}
      cards={[]}
      {...props}
    />,
  );

// The header is what the card's own (hidden) heading sits in.
const header = () =>
  screen.getByRole("heading", { name: "Trip List" }).parentElement!;

describe("TripsPageFrame", () => {
  it("draws the trips as one list of cards", () => {
    frame({
      totalCount: 2,
      cards: [<li key="a">Dahab 2026</li>, <li key="b">Koh Tao 2025</li>],
    });

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Dahab 2026",
      "Koh Tao 2025",
    ]);
  });

  it("holds the list's place with placeholders while it loads", () => {
    frame({ isLoading: true, itemsPerPage: 4 });

    const list = screen.getByRole("list");
    expect(list).toHaveAttribute("aria-busy", "true");
    expect(list.querySelectorAll("li[aria-hidden]")).toHaveLength(4);
  });

  it("puts the search box in the header row, beside the count", () => {
    frame({ totalCount: 12, cards: [<li key="t" />] });

    expect(within(header()).getByText("12 total trips")).toBeInTheDocument();
    expect(
      within(header()).getByLabelText("Search trips by name or location"),
    ).toBeInTheDocument();
  });

  it("reports what is typed into it", async () => {
    const onSearchChange = vi.fn();
    frame({ onSearchChange, cards: [<li key="t" />] });

    await userEvent.type(
      screen.getByLabelText("Search trips by name or location"),
      "d",
    );

    expect(onSearchChange).toHaveBeenCalledWith("d");
  });

  it("says a searched list matched nothing, and offers nothing to add", () => {
    frame({ search: "dahab", isSearching: true });

    expect(
      screen.getByText("No trips match that name or location."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add your first trip/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the first-trip invitation for a list that is simply empty", () => {
    frame();

    expect(screen.getByText("No trips yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add your first trip/ }),
    ).toBeInTheDocument();
  });

  it("drops the count and the box for a list that is simply empty", () => {
    frame();

    expect(screen.queryByText("0 total trips")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Search trips by name or location"),
    ).not.toBeInTheDocument();
  });

  it("keeps them for a search that matched nothing", () => {
    frame({ search: "dahab", isSearching: true });

    expect(within(header()).getByText("0 trips found")).toBeInTheDocument();
    expect(
      within(header()).getByLabelText("Search trips by name or location"),
    ).toBeInTheDocument();
  });

  // The term is only asked for once the typing stops, so for a quarter second
  // the box holds one and `isSearching` does not. Reading the box as well is
  // what keeps it from vanishing under the diver mid-word.
  it("keeps them for a term still waiting on the debounce", () => {
    frame({ search: "dahab" });

    expect(
      within(header()).getByLabelText("Search trips by name or location"),
    ).toBeInTheDocument();
  });

  // Emptying the box is the way out of a search that matched nothing, and for
  // one commit it leaves the term gone and the search's own (empty) cards still
  // on screen. Dropping the box there would take the diver's cursor with it.
  it("keeps them through the commit where a cleared term outruns its cards", () => {
    const { rerender } = frame({ search: "dahab", isSearching: true });

    rerender(
      <TripsPageFrame
        isLoading={false}
        totalCount={0}
        itemsPerPage={10}
        cards={[]}
        search=""
        isSearching={false}
      />,
    );

    expect(
      within(header()).getByLabelText("Search trips by name or location"),
    ).toBeInTheDocument();
  });
});
