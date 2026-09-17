import { beforeEach, describe, expect, it } from "vitest";
import { useLayoutEffect, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePointer } from "@/test/pointer";
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

  it("takes the held time when the date finally arrives by typing", async () => {
    // An hour set before any date exists is held rather than stamped onto
    // today, so the blur that supplies the date has to pick it up - the grid's
    // own path already does.
    render(<Field />);

    await userEvent.click(box());
    const hours = screen.getByRole("spinbutton", { name: "Hours" });
    await userEvent.clear(hours);
    await userEvent.type(hours, "18");
    expect(committed()).toBe("");

    await userEvent.click(box());
    await userEvent.type(box(), "2024-06-01");
    await userEvent.tab();

    expect(committed()).toBe("2024-06-01 18:00:00");
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

  it("never paints the value it held before an outside change", async () => {
    // The dive form re-stamps `start_time` once the last dive lands, so a box
    // that trails its prop by a commit shows the earlier stamp. See the same
    // test in `date-picker.render.test.tsx` for why a layout effect is what
    // catches it.
    const painted: string[] = [];

    function Harness() {
      const [value, setValue] = useState("2024-06-01 10:04:47");
      useLayoutEffect(() => {
        painted.push((screen.getByRole("textbox") as HTMLInputElement).value);
      });
      return (
        <>
          <DateTimePicker value={value} onChange={setValue} />
          <button type="button" onClick={() => setValue("2024-06-01 10:04:48")}>
            Replace
          </button>
        </>
      );
    }

    render(<Harness />);
    painted.length = 0;
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));

    expect(painted).not.toContain("2024-06-01 10:04:47");
    expect(box()).toHaveValue("2024-06-01 10:04:48");
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

// The same field on a phone: two OS wheels, one for the date and one for the
// time, and a value the pair has to keep whole between them.

function TouchField({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="start-time">Start time</label>
      <DateTimePicker id="start-time" value={value} onChange={setValue} />
      <output data-testid="committed">{value}</output>
    </>
  );
}

// The date box is the primary control, so it carries the form's label; the time
// box names itself.
const dateWheel = () => screen.getByLabelText("Start time");
const timeWheel = () => screen.getByLabelText("Time");

// A wheel hands its whole answer over at once - see `date-picker.render.test`.
const hand = (input: HTMLElement, value: string) =>
  fireEvent.change(input, { target: { value } });

describe("DateTimePicker on a touch device", () => {
  beforeEach(() => usePointer("coarse"));

  it("is a date wheel and a time wheel, with no calendar behind them", () => {
    render(<TouchField initial="2026-04-17 11:49:23" />);

    expect(dateWheel()).toHaveAttribute("type", "date");
    expect(timeWheel()).toHaveAttribute("type", "time");
    expect(
      screen.queryByRole("button", { name: "Choose date and time" }),
    ).not.toBeInTheDocument();
  });

  it("re-dates an imported dive without disturbing its seconds", () => {
    // The stamp a dive computer wrote is the value here, and the date is the
    // half a diver ever corrects. `datetime-local` on iOS drops the seconds on
    // exactly this edit, which is why this field is two inputs.
    render(<TouchField initial="2026-04-17 11:49:23" />);

    hand(dateWheel(), "2026-04-18");

    expect(committed()).toBe("2026-04-18 11:49:23");
  });

  it("zeroes the seconds a time wheel never offered", () => {
    // The wheel showed hours and minutes, so those are what the diver set - and
    // carrying the old seconds through would leave a time nobody chose.
    render(<TouchField initial="2026-04-17 11:49:23" />);

    hand(timeWheel(), "06:30");

    expect(committed()).toBe("2026-04-17 06:30:00");
  });

  it("keeps the seconds a wheel that had them hands back", () => {
    // `step={1}` asks for them, and a desktop-class browser reaching this branch
    // shows them.
    render(<TouchField initial="2026-04-17 11:49:23" />);

    hand(timeWheel(), "06:30:45");

    expect(committed()).toBe("2026-04-17 06:30:45");
  });

  it("holds a time set before any date, and commits nothing until one arrives", () => {
    // A time never invents a date: stamping today onto a dive being back-filled
    // from a paper logbook is the one date it certainly is not.
    render(<TouchField />);

    hand(timeWheel(), "06:30");
    expect(committed()).toBe("");
    expect(timeWheel()).toHaveValue("06:30");

    hand(dateWheel(), "2026-04-17");
    expect(committed()).toBe("2026-04-17 06:30:00");
  });

  it("takes midnight for a date set with no time at all", () => {
    render(<TouchField />);

    hand(dateWheel(), "2026-04-17");

    expect(committed()).toBe("2026-04-17 00:00:00");
  });

  it("holds an emptied time rather than reading it as midnight", () => {
    render(<TouchField initial="2026-04-17 11:49:23" />);

    hand(timeWheel(), "");

    expect(committed()).toBe("2026-04-17 11:49:23");
    expect(timeWheel()).toHaveValue("");
  });

  it("empties the value when the date is cleared", () => {
    render(<TouchField initial="2026-04-17 11:49:23" />);

    hand(dateWheel(), "");

    expect(committed()).toBe("");
  });

  it("follows the value when it changes from outside", () => {
    // The dive form stamps `start_time` a second time when the last dive lands,
    // so both boxes have to move with it.
    function Harness() {
      const [value, setValue] = useState("2026-04-17 11:49:23");
      return (
        <>
          <label htmlFor="start-time">Start time</label>
          <DateTimePicker id="start-time" value={value} onChange={setValue} />
          <button type="button" onClick={() => setValue("2024-06-01 10:04:47")}>
            Replace
          </button>
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    expect(dateWheel()).toHaveValue("2024-06-01");
    expect(timeWheel()).toHaveValue("10:04:47");
  });
});
