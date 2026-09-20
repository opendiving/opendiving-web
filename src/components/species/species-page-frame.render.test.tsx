import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SpeciesPageFrame } from "./species-page-frame";

// The box sits in the card's header row beside the count, where every other
// list card in the app puts it, rather than above the grid on a line of its own -
// and an empty life list draws neither.

const frame = (props: Partial<Parameters<typeof SpeciesPageFrame>[0]> = {}) =>
  render(
    <SpeciesPageFrame
      isLoading={false}
      totalCount={0}
      itemsPerPage={24}
      cards={[]}
      {...props}
    />,
  );

// The header is what the card's own (hidden) heading sits in.
const header = () =>
  screen.getByRole("heading", { name: "Life List" }).parentElement!;

describe("SpeciesPageFrame", () => {
  it("puts the search box in the header row, beside the count", () => {
    frame({ totalCount: 12, cards: [<div key="c" />] });

    expect(within(header()).getByText("12 species")).toBeInTheDocument();
    expect(
      within(header()).getByLabelText("Search your species by name"),
    ).toBeInTheDocument();
  });

  it("reports what is typed into it", async () => {
    const onSearchChange = vi.fn();
    frame({ onSearchChange, cards: [<div key="c" />] });

    await userEvent.type(
      screen.getByLabelText("Search your species by name"),
      "n",
    );

    expect(onSearchChange).toHaveBeenCalledWith("n");
  });

  it("says a searched life list matched nothing, and offers nothing to add", () => {
    frame({ search: "nudi", isSearching: true });

    expect(screen.getByText("No species match that name.")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Go to your dives/ }),
    ).not.toBeInTheDocument();
  });

  it("drops the count and the box for a life list that is simply empty", () => {
    frame();

    expect(screen.queryByText("0 species")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Search your species by name"),
    ).not.toBeInTheDocument();
  });

  it("keeps them for a search that matched nothing", () => {
    frame({ search: "nudi", isSearching: true });

    expect(within(header()).getByText("0 species")).toBeInTheDocument();
    expect(
      within(header()).getByLabelText("Search your species by name"),
    ).toBeInTheDocument();
  });

  // The term is only asked for once the typing stops, so for a quarter second
  // the box holds one and `isSearching` does not. Reading the box as well is
  // what keeps it from vanishing under the diver mid-word.
  it("keeps them for a term still waiting on the debounce", () => {
    frame({ search: "nudi" });

    expect(
      within(header()).getByLabelText("Search your species by name"),
    ).toBeInTheDocument();
  });

  // Emptying the box is the way out of a search that matched nothing, and for
  // one commit it leaves the term gone and the search's own (empty) cards still
  // on screen. Dropping the box there would take the diver's cursor with it.
  it("keeps them through the commit where a cleared term outruns its cards", () => {
    const { rerender } = frame({ search: "nudi", isSearching: true });

    rerender(
      <SpeciesPageFrame
        isLoading={false}
        totalCount={0}
        itemsPerPage={24}
        cards={[]}
        search=""
        isSearching={false}
      />,
    );

    expect(
      within(header()).getByLabelText("Search your species by name"),
    ).toBeInTheDocument();
  });
});
