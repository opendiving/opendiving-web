import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatePicker } from "./date-picker";

// The field is typed into as often as it is picked from - a diver back-filling a
// paper logbook has the date in front of them and no reason to drive a calendar
// twelve months at a time. What these pin is the seam between the two: when
// typed text becomes the value, and what happens to text that never became a
// date.

function Field({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DatePicker value={value} onChange={setValue} />
      <output data-testid="committed">{value}</output>
    </>
  );
}

const box = () => screen.getByRole("textbox");
// Not `getByRole("status")`: the calendar has a live region of its own, and
// the popover the date-time picker leaves open makes that a second match.
const committed = () => screen.getByTestId("committed").textContent;

describe("DatePicker text entry", () => {
  it("commits the typed date when the field is left", async () => {
    render(<Field />);

    await userEvent.type(box(), "2024-06-01");
    await userEvent.tab();

    expect(committed()).toBe("2024-06-01");
  });

  it("commits on Enter, which submits a form without blurring first", async () => {
    render(<Field />);

    await userEvent.type(box(), "2024-06-01{Enter}");

    expect(committed()).toBe("2024-06-01");
  });

  it("accepts a pasted date in a looser shape, and tidies it on the way out", async () => {
    render(<Field />);

    await userEvent.click(box());
    await userEvent.paste("2024/6/1");
    expect(box()).toHaveValue("2024/6/1");

    await userEvent.tab();
    expect(box()).toHaveValue("2024-06-01");
    expect(committed()).toBe("2024-06-01");
  });

  it("holds the previous date while a replacement is half-typed", async () => {
    render(<Field initial="2024-06-01" />);

    await userEvent.clear(box());
    await userEvent.type(box(), "2025-0");

    expect(committed()).toBe("2024-06-01");
  });

  it("discards text that never became a date", async () => {
    render(<Field initial="2024-06-01" />);

    await userEvent.type(box(), "junk");
    await userEvent.tab();

    expect(box()).toHaveValue("2024-06-01");
    expect(committed()).toBe("2024-06-01");
  });

  it("refuses a day the month does not have, and never keeps one it passed through", async () => {
    // "2024-06-31" is typed through "2024-06-3", which is a real date and the
    // wrong one. Nothing is committed until the field is left, so there is no
    // 3rd of June to be left holding.
    render(<Field />);

    await userEvent.type(box(), "2024-06-31");
    await userEvent.tab();

    expect(committed()).toBe("");
    expect(box()).toHaveValue("");
  });

  it("clears the field when the text is emptied", async () => {
    render(<Field initial="2024-06-01" />);

    await userEvent.clear(box());
    await userEvent.tab();

    expect(committed()).toBe("");
  });

  it("clears from the clear button too", async () => {
    render(<Field initial="2024-06-01" />);

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(committed()).toBe("");
    expect(box()).toHaveValue("");
  });

  it("opens the calendar on focus, without taking the keystrokes", async () => {
    render(<Field />);

    await userEvent.click(box());
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(box()).toHaveFocus();

    await userEvent.keyboard("2024-06-01");
    expect(box()).toHaveValue("2024-06-01");
  });

  it("walks the calendar to the month being typed", async () => {
    render(<Field initial="2020-01-05" />);

    await userEvent.click(box());
    await userEvent.clear(box());
    await userEvent.keyboard("2024-06-14");

    // Nothing is committed yet - the calendar is following the text.
    expect(committed()).toBe("2020-01-05");
    expect(
      screen.getByRole("button", { name: /June 14th, 2024/ }),
    ).toBeInTheDocument();
  });

  it("closes on a pick and hands focus back to the box", async () => {
    render(<Field initial="2024-06-01" />);

    await userEvent.click(box());
    await userEvent.click(
      screen.getByRole("button", { name: /June 15th, 2024/ }),
    );

    expect(committed()).toBe("2024-06-15");
    expect(box()).toHaveFocus();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("reopens on a click into the box it just handed focus back to", async () => {
    // `focus` does not fire on an already-focused input, so the click handler is
    // the only thing that can bring the calendar back after a pick or Escape.
    render(<Field initial="2024-06-01" />);

    await userEvent.click(box());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();

    await userEvent.click(box());
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("hands focus back to the icon button when Escape closes the grid", async () => {
    // The icon button is the one path that puts focus inside the calendar, so
    // it is the one close that needs Radix's restore: without it Escape
    // unmounts the focused day cell and focus falls to the document body.
    render(<Field initial="2024-06-01" />);

    const icon = screen.getByRole("button", { name: "Choose date" });
    await userEvent.click(icon);
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(document.body).not.toHaveFocus();
    expect(icon).toHaveFocus();
  });

  it("still picks from the calendar, and shows what was picked", async () => {
    render(<Field initial="2024-06-01" />);

    await userEvent.click(screen.getByRole("button", { name: "Choose date" }));
    await userEvent.click(
      screen.getByRole("button", { name: /June 15th, 2024/ }),
    );

    expect(committed()).toBe("2024-06-15");
    expect(box()).toHaveValue("2024-06-15");
  });

  it("puts the form's label on the box a diver types into", () => {
    render(
      <>
        <label htmlFor="certified-on">Certified on</label>
        <DatePicker id="certified-on" value="" onChange={() => {}} />
      </>,
    );

    expect(screen.getByLabelText("Certified on")).toBe(box());
  });
});
