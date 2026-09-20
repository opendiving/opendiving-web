import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SitesPageFrame } from "./sites-page-frame";

// Two things the search costs the frame: the box shares the card's header row
// with the count, and a list searched down to nothing is not an empty one.

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
    frame({ onSearchChange });

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
});
