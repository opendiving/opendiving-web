import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ListSearch } from "./list-search";

// Which of the two halves is on screen is a breakpoint, so it is checked in a
// real browser (`list-search.browser.test.tsx`). What is left here is everything
// the width does not decide: what the button says, and where the cursor lands.

const control = (props: Partial<Parameters<typeof ListSearch>[0]> = {}) =>
  render(
    <ListSearch
      id="thing-search"
      label="Search things by name"
      toggleLabel="Search things"
      value=""
      onChange={vi.fn()}
      {...props}
    />,
  );

const toggle = () => screen.getByRole("button", { name: /^Search things/ });

describe("ListSearch", () => {
  it("opens and shuts the box it folds away", async () => {
    control();

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).toHaveAttribute("aria-controls", "thing-search");

    await userEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  // Pressing a magnifier and then reaching for the box is a click nobody wanted.
  it("puts the cursor in the box on opening, and again on re-opening", async () => {
    control();

    await userEvent.click(toggle());
    expect(screen.getByLabelText("Search things by name")).toHaveFocus();

    await userEvent.click(toggle());
    await userEvent.click(toggle());
    expect(screen.getByLabelText("Search things by name")).toHaveFocus();
  });

  // A folded box still narrowing the list is the failure the button's own words
  // exist for: it is the only thing left on screen saying so.
  it("says so when a folded box is still narrowing the list", () => {
    control({ value: "wreck" });

    expect(
      screen.getByRole("button", {
        name: "Search things, narrowing the list",
      }),
    ).toBeInTheDocument();
  });

  it("does not claim narrowing on an untouched list", () => {
    control();

    expect(
      screen.getByRole("button", { name: "Search things" }),
    ).toBeInTheDocument();
  });
});
