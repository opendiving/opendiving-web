import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RatingInput, RatingLabelRow, RatingStars } from "./rating-input";

// What the control has to be is a keyboard and screen-reader question as much as
// a pointer one: the arrows move the step, a key clears it, and the group and
// each step are named. The single tab stop is the browser's radio-group
// behaviour, which user-event does not model, and where the Clear button sits is
// a layout question jsdom cannot answer; that it is there only while there is a
// rating to clear is this file's.

function Field({ initial = null }: { initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <RatingLabelRow canClear={value !== null} onClear={() => setValue(null)}>
        <span id="rating-label">Rating</span>
      </RatingLabelRow>
      <RatingInput
        aria-labelledby="rating-label"
        value={value}
        onChange={setValue}
      />
      <output data-testid="value">{String(value)}</output>
    </>
  );
}

const value = () => screen.getByTestId("value").textContent;

describe("RatingInput", () => {
  it("is a group named by its label, of five steps named by their stars", () => {
    render(<Field />);

    const group = screen.getByRole("radiogroup", { name: "Rating" });
    expect(group).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("aria-label")),
    ).toEqual(["1 star", "2 stars", "3 stars", "4 stars", "5 stars"]);
  });

  it("picks the step clicked", async () => {
    render(<Field />);

    await userEvent.click(screen.getByRole("radio", { name: "4 stars" }));

    expect(value()).toBe("4");
    expect(screen.getByRole("radio", { name: "4 stars" })).toBeChecked();
  });

  it("moves the step with the arrow keys", async () => {
    render(<Field initial={3} />);

    screen.getByRole("radio", { name: "3 stars" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(value()).toBe("4");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(value()).toBe("2");
  });

  it("clears on Backspace or Delete", async () => {
    render(<Field initial={3} />);

    screen.getByRole("radio", { name: "3 stars" }).focus();
    await userEvent.keyboard("{Backspace}");
    expect(value()).toBe("null");

    await userEvent.click(screen.getByRole("radio", { name: "2 stars" }));
    await userEvent.keyboard("{Delete}");
    expect(value()).toBe("null");
    expect(screen.getByRole("radio", { name: "2 stars" })).not.toBeChecked();
  });
});

describe("RatingLabelRow", () => {
  it("offers Clear only while there is a rating to clear", async () => {
    render(<Field />);
    expect(
      screen.queryByRole("button", { name: "Clear rating" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "5 stars" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear rating" }));

    expect(value()).toBe("null");
    expect(
      screen.queryByRole("button", { name: "Clear rating" }),
    ).not.toBeInTheDocument();
  });
});

describe("RatingStars", () => {
  it("reads as one image named for the rating", () => {
    render(<RatingStars rating={4} />);

    expect(
      screen.getByRole("img", { name: "4 of 5 stars" }),
    ).toBeInTheDocument();
  });
});
