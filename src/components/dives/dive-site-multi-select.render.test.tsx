import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveSiteMultiSelect } from "./dive-site-multi-select";

// This field shares `CreatableCombobox` with the trip location picker, and the
// rules about what counts as choosing an item were tightened there - for every
// append-only field, not just that one. Pinned here because the change is
// invisible from the trips tests: typing an exact name used to append the site
// on the keystroke, and blurring used to commit an exact match, and both are
// gone. What is left, and what these assert, is a click or Enter.

vi.mock("@/lib/api/dive-sites", () => ({
  diveSitesAPI: { getDiveSites: vi.fn(), getDiveSite: vi.fn() },
}));

const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const getDiveSites = vi.mocked(diveSitesAPI.getDiveSites);

const SITE = { uuid: "site-1", name: "Blue Hole", location: "Dahab, Egypt" };

beforeEach(() => {
  getDiveSites.mockReset();
  getDiveSites.mockResolvedValue({
    data: [SITE],
    total_count: 1,
    has_more: false,
    page: 1,
    items_per_page: 25,
  } as never);
});

function Field() {
  const [value, setValue] = useState<string[]>([]);
  return <DiveSiteMultiSelect userId="u1" value={value} onChange={setValue} />;
}

const rows = () =>
  Array.from(document.querySelectorAll("li")).map((li) =>
    li.textContent?.trim(),
  );

// The menu's own row, once the open-query has answered.
const openMenu = async () => {
  await userEvent.click(screen.getByRole("combobox"));
  await waitFor(() =>
    expect(screen.getByRole("option", { name: /Blue Hole/ })).toBeVisible(),
  );
};

describe("DiveSiteMultiSelect", () => {
  it("adds a site when its row is picked", async () => {
    render(<Field />);
    await openMenu();

    await userEvent.click(screen.getByRole("option", { name: /Blue Hole/ }));

    await waitFor(() => expect(rows()).toEqual(["Blue Hole, Dahab, Egypt"]));
  });

  it("adds a site on Enter", async () => {
    render(<Field />);
    await openMenu();

    await userEvent.paste("Blue Hole");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(rows()).toEqual(["Blue Hole, Dahab, Egypt"]));
  });

  it("adds nothing from typing the name alone", async () => {
    // The "Bohol" on the way to "Bohol Sea" case: a name typed on the way to a
    // longer one is not a choice, and this field's `onChange` appends.
    render(<Field />);
    await openMenu();

    await userEvent.paste("Blue Hole");
    await waitFor(() => expect(getDiveSites).toHaveBeenCalled());

    expect(rows()).toEqual([]);
  });

  it("says it is searching while the list is loading, not that there is none", async () => {
    // The field's opening query is a real request, and "No dive sites yet." is
    // a claim about the diver's whole catalogue - the worst possible thing to
    // say while still waiting to hear.
    getDiveSites.mockReturnValue(new Promise(() => {}) as never);
    render(<Field />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Searching...")).toBeInTheDocument();
    expect(screen.queryByText("No dive sites yet.")).not.toBeInTheDocument();
  });

  it("says the search is down when the opening query fails", async () => {
    getDiveSites.mockRejectedValue(new Error("500"));
    render(<Field />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(
      await screen.findByText("Search is unavailable right now."),
    ).toBeInTheDocument();
  });

  it("adds nothing on the way out of the field", async () => {
    render(
      <>
        <Field />
        <button type="button">Elsewhere</button>
      </>,
    );
    await openMenu();
    await userEvent.paste("Blue Hole");

    await userEvent.click(screen.getByRole("button", { name: "Elsewhere" }));

    expect(rows()).toEqual([]);
  });
});
