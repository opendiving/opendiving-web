import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTimePicker } from "./date-time-picker";

// The dive form's start time. Typing it is the fast path off a paper logbook,
// and the calendar and the hour/minute/second boxes behind it keep working
// against the same value.

function Field({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateTimePicker value={value} onChange={setValue} />
      <output data-testid="committed">{value}</output>
    </>
  );
}

const box = () => screen.getByRole("textbox");
// Not `getByRole("status")`: the calendar has a live region of its own, and
// the popover the date-time picker leaves open makes that a second match.
const committed = () => screen.getByTestId("committed").textContent;

describe("DateTimePicker text entry", () => {
  it("commits a typed date and time when the field is left", async () => {
    render(<Field />);

    await userEvent.type(box(), "2024-06-01 10:04:47");
    await userEvent.tab();

    expect(committed()).toBe("2024-06-01 10:04:47");
  });

  it("takes the ISO 'T' separator and fills in the parts left off", async () => {
    render(<Field />);

    await userEvent.click(box());
    await userEvent.paste("2024-06-01T10:04");
    await userEvent.tab();

    expect(committed()).toBe("2024-06-01 10:04:00");
    expect(box()).toHaveValue("2024-06-01 10:04:00");
  });

  it("reads a bare date as midnight, as picking one in the calendar does", async () => {
    render(<Field />);

    await userEvent.type(box(), "2024-06-01");
    await userEvent.tab();

    expect(committed()).toBe("2024-06-01 00:00:00");
  });

  it("refuses a pasted string carrying a UTC offset", async () => {
    // The offset belongs to the dive, not to this box, and this component has
    // nowhere to put one - so accepting the paste would mean dropping it and
    // moving the dive by those hours in silence.
    render(<Field initial="2024-06-01 10:04:47" />);

    await userEvent.clear(box());
    await userEvent.paste("2024-06-02T11:00:00+02:00");
    await userEvent.tab();

    expect(committed()).toBe("2024-06-01 10:04:47");
    expect(box()).toHaveValue("2024-06-01 10:04:47");
  });

  it("opens the calendar on focus, without taking the keystrokes", async () => {
    render(<Field />);

    await userEvent.click(box());
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(box()).toHaveFocus();

    await userEvent.keyboard("2024-06-01 10:04:47");
    expect(box()).toHaveValue("2024-06-01 10:04:47");
  });

  it("walks the calendar to the month being typed", async () => {
    render(<Field initial="2020-01-05 08:00:00" />);

    await userEvent.click(box());
    await userEvent.clear(box());
    await userEvent.keyboard("2024-06-14 07:15");

    expect(committed()).toBe("2020-01-05 08:00:00");
    expect(
      screen.getByRole("button", { name: /June 14th, 2024/ }),
    ).toBeInTheDocument();
  });

  it("keeps the typed time when a date is then picked from the calendar", async () => {
    // No trip through the icon button: focusing the field opened the calendar,
    // and typing walked it to June. Clicking the day blurs the box first, so the
    // typed time is already committed by the time the date lands on top of it.
    render(<Field />);

    await userEvent.type(box(), "2024-06-01 10:04:47");
    await userEvent.click(
      screen.getByRole("button", { name: /June 15th, 2024/ }),
    );

    expect(committed()).toBe("2024-06-15 10:04:47");
    expect(box()).toHaveValue("2024-06-15 10:04:47");
  });

  it("puts the icon button's calendar away again, as a disclosure should", async () => {
    render(<Field initial="2024-06-01 10:04:47" />);

    await userEvent.click(box());
    const icon = screen.getByRole("button", { name: "Choose date and time" });
    expect(icon).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(icon);
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("shows a time edited in the popover's own boxes", async () => {
    render(<Field initial="2024-06-01 10:04:47" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Choose date and time" }),
    );
    const hours = screen.getByRole("spinbutton", { name: "Hours" });
    await userEvent.clear(hours);
    await userEvent.type(hours, "18");

    expect(committed()).toBe("2024-06-01 18:04:47");
    expect(box()).toHaveValue("2024-06-01 18:04:47");
  });

  it("hands focus back to the icon button when Escape closes the grid", async () => {
    render(<Field initial="2024-06-01 10:04:47" />);

    const icon = screen.getByRole("button", { name: "Choose date and time" });
    await userEvent.click(icon);
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(document.body).not.toHaveFocus();
    expect(icon).toHaveFocus();
  });

  it("puts the form's label on the box a diver types into", () => {
    render(
      <>
        <label htmlFor="start-time">Start time</label>
        <DateTimePicker id="start-time" value="" onChange={() => {}} />
      </>,
    );

    expect(screen.getByLabelText("Start time")).toBe(box());
  });
});
