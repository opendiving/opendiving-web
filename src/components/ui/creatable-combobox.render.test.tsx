import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatableCombobox, type ComboboxItem } from "./creatable-combobox";

// A selection is not a query. Everything here is about the single-select with
// something already in it - the trip picker on a dive that is already filed
// under one - where the input's text doubles as the search query and so used to
// open the menu on the one row already chosen.

const TRIPS: ComboboxItem[] = [
  { id: "t1", name: "Dahab 2025" },
  { id: "t2", name: "Red Sea 2026" },
  { id: "t3", name: "Bohol 2024" },
];

// Stands in for the API, which matches a case-insensitive substring.
const onSearch = vi.fn(async (query: string) => ({
  items: TRIPS.filter((trip) =>
    trip.name.toLowerCase().includes(query.toLowerCase()),
  ),
}));

beforeEach(() => {
  onSearch.mockClear();
});

function Field({ initial = "t1" }: { initial?: string | undefined }) {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <CreatableCombobox
      value={value}
      // What a remote-mode single-select passes for a selection loaded from the
      // form rather than picked in this session.
      selectedItem={TRIPS[0]}
      onSearch={onSearch}
      onChange={setValue}
      noItemsLabel="No trips yet."
      noMatchesLabel="No trips match."
    />
  );
}

const box = () => screen.getByRole("combobox");
const rowNames = () =>
  screen.getAllByRole("option").map((row) => row.textContent);

describe("CreatableCombobox opened on a selection", () => {
  it("searches for nothing, and offers every trip", async () => {
    render(<Field />);
    expect(box()).toHaveValue("Dahab 2025");

    await userEvent.click(box());

    await waitFor(() => expect(rowNames()).toHaveLength(3));
    expect(onSearch).toHaveBeenCalledWith("");
    expect(onSearch).not.toHaveBeenCalledWith("Dahab 2025");
    expect(rowNames()).toEqual(["Dahab 2025", "Red Sea 2026", "Bohol 2024"]);
  });

  it("marks the selected row without highlighting it", async () => {
    // `bg-accent/50` is the selection; `bg-accent` is the keyboard highlight,
    // which stays off so Enter keeps meaning "commit the text".
    render(<Field />);
    await userEvent.click(box());

    await waitFor(() => expect(rowNames()).toHaveLength(3));
    const [selected] = screen.getAllByRole("option");
    expect(selected).toHaveClass("bg-accent/50");
    expect(box()).not.toHaveAttribute("aria-activedescendant");
  });

  it("filters from the moment the diver types", async () => {
    render(<Field />);
    await userEvent.click(box());
    await waitFor(() => expect(rowNames()).toHaveLength(3));

    await userEvent.clear(box());
    await userEvent.type(box(), "red");

    await waitFor(() => expect(onSearch).toHaveBeenCalledWith("red"));
    await waitFor(() => expect(rowNames()).toEqual(["Red Sea 2026"]));
  });

  it("goes back to the whole list after a pick", async () => {
    // The pick writes the chosen name into the input, so without resetting the
    // flag the very next opening would be filtered by it - the original bug, one
    // selection later.
    render(<Field />);
    await userEvent.click(box());
    await waitFor(() => expect(rowNames()).toHaveLength(3));

    await userEvent.click(screen.getByRole("option", { name: "Bohol 2024" }));
    expect(box()).toHaveValue("Bohol 2024");

    onSearch.mockClear();
    await userEvent.click(box());

    await waitFor(() => expect(rowNames()).toHaveLength(3));
    expect(onSearch).toHaveBeenCalledWith("");
    expect(onSearch).not.toHaveBeenCalledWith("Bohol 2024");
  });

  it("waits for this opening's own results before scrolling to the selection", async () => {
    // `remoteResult` outlives the menu closing, so reopening renders the
    // previous query's rows first. Scrolling then aims at a list about to be
    // replaced, and the scroll happens once - measured in the app as a menu
    // parked six rows short of the trip it was opened on.
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    const rowsWhenScrolled: number[] = [];
    scrollIntoView.mockImplementation(() => {
      rowsWhenScrolled.push(screen.queryAllByRole("option").length);
    });

    render(<Field />);
    await userEvent.click(box());
    await waitFor(() => expect(rowNames()).toHaveLength(3));

    // Narrow to one row, take it, and reopen on the list that answer left behind.
    await userEvent.clear(box());
    await userEvent.type(box(), "bohol");
    await waitFor(() => expect(rowNames()).toEqual(["Bohol 2024"]));
    await userEvent.click(screen.getByRole("option", { name: "Bohol 2024" }));

    rowsWhenScrolled.length = 0;
    await userEvent.click(box());
    await waitFor(() => expect(rowNames()).toHaveLength(3));

    expect(rowsWhenScrolled).toEqual([3]);
    scrollIntoView.mockRestore();
  });

  it("says the list is empty rather than searching forever", async () => {
    // `searchPending` compares the query the server answered against the query
    // the menu is about. Left on the raw text it compares "" against
    // "Dahab 2025", never agrees, and reports "Searching..." for as long as the
    // menu is empty.
    onSearch.mockResolvedValueOnce({ items: [] });
    render(<Field />);

    await userEvent.click(box());

    await waitFor(() =>
      expect(screen.getByText("No trips yet.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Searching...")).not.toBeInTheDocument();
  });
});
