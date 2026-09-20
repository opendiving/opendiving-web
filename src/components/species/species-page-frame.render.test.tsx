import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SpeciesPageFrame } from "./species-page-frame";

// The box sits in the card's header row beside the count, where every other
// list card in the app puts it, rather than above the grid on a line of its own.

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
    frame({ onSearchChange });

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
});
