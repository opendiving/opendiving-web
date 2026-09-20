import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TripsPageFrame } from "./trips-page-frame";

// Two things the search costs the frame: the box shares the card's header row
// with the count, and a list searched down to nothing is not an empty logbook.

const frame = (props: Partial<Parameters<typeof TripsPageFrame>[0]> = {}) =>
  render(
    <TripsPageFrame
      isLoading={false}
      totalCount={0}
      itemsPerPage={10}
      rows={[]}
      {...props}
    />,
  );

// The header is what the card's own (hidden) heading sits in.
const header = () =>
  screen.getByRole("heading", { name: "Trip List" }).parentElement!;

describe("TripsPageFrame", () => {
  it("puts the search box in the header row, beside the count", () => {
    frame({ totalCount: 12, rows: [<tr key="t" />] });

    expect(within(header()).getByText("12 total trips")).toBeInTheDocument();
    expect(
      within(header()).getByLabelText("Search trips by name or location"),
    ).toBeInTheDocument();
  });

  it("reports what is typed into it", async () => {
    const onSearchChange = vi.fn();
    frame({ onSearchChange });

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
});
