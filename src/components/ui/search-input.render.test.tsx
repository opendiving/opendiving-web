import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SearchInput } from "./search-input";

// The box is controlled, so the interesting half is the clear control: it only
// exists while there is something to clear, and it hands the cursor back rather
// than leaving the diver pointing at an empty field they have to click into.

const box = (props: Partial<Parameters<typeof SearchInput>[0]> = {}) =>
  render(
    <SearchInput
      id="thing-search"
      label="Search things by name"
      value=""
      onChange={vi.fn()}
      {...props}
    />,
  );

describe("SearchInput", () => {
  it("is named for a screen reader, with nothing drawn saying so", () => {
    box();

    expect(screen.getByLabelText("Search things by name")).toBeInTheDocument();
  });

  it("reports what is typed", async () => {
    const onChange = vi.fn();
    box({ onChange });

    await userEvent.type(screen.getByLabelText("Search things by name"), "a");

    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("offers nothing to clear while it is empty", () => {
    box();

    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
  });

  it("clears the term and puts the cursor back in the box", async () => {
    const onChange = vi.fn();
    box({ value: "wreck", onChange });

    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByLabelText("Search things by name")).toHaveFocus();
  });
});
