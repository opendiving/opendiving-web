import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveStartTimeField } from "./dive-start-time-field";

// The composite field owns the one conversion in the app that turns two
// controls into a single ISO `start_time`, so what it does with a half-empty
// pair is its own question rather than either control's.

function Field({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DiveStartTimeField value={value} onChange={setValue} />
      <output data-testid="committed">{value}</output>
    </>
  );
}

const box = () => screen.getByRole("textbox");
const committed = () => screen.getByTestId("committed").textContent;

describe("DiveStartTimeField", () => {
  it("keeps a typed edit and the dive's own offset together", async () => {
    render(<Field initial="2021-04-04T10:04:47+02:00" />);

    await userEvent.clear(box());
    await userEvent.type(box(), "2021-04-04 11:30:00");
    await userEvent.tab();

    expect(committed()).toBe("2021-04-04T11:30:00+02:00");
  });

  it("empties the whole value when the box is emptied", async () => {
    // Not `combineStartTime("", 120)`, which is the bare string "+02:00": it
    // has no time for the offset matcher to anchor on, so it reads back as an
    // offsetless value, `new Date()` refuses it, and the field redraws as
    // "NaN-NaN-NaN NaN:NaN:NaN" beside an offset that has gone "Not recorded".
    render(<Field initial="2021-04-04T10:04:47+02:00" />);

    await userEvent.clear(box());
    await userEvent.tab();

    expect(committed()).toBe("");
    expect(box()).toHaveValue("");
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});

// A dive imported with only its date. Only a logbook import makes one, and the
// API keeps the state for as long as the form sends the bare date back.
describe("DiveStartTimeField on a dive whose time of day was never recorded", () => {
  const time = () => screen.getByLabelText("Time");
  const offset = () => screen.getByRole("combobox", { name: "UTC offset" });

  it("shows the date, an empty time and no offset to choose", () => {
    render(<Field initial="2002-06-18" />);

    expect(box()).toHaveValue("2002-06-18");
    expect(time()).toHaveValue("");
    expect(offset()).toBeDisabled();
    expect(offset()).toHaveTextContent("Not recorded");
    expect(screen.queryByDisplayValue(/00:00/)).not.toBeInTheDocument();
  });

  it("re-dates the dive and keeps it a date", async () => {
    render(<Field initial="2002-06-18" />);

    await userEvent.clear(box());
    await userEvent.type(box(), "2002-06-19");
    await userEvent.tab();

    expect(committed()).toBe("2002-06-19");
  });

  it("becomes a date-time with no offset once a time is typed", () => {
    render(<Field initial="2002-06-18" />);

    fireEvent.change(time(), { target: { value: "10:30" } });

    expect(committed()).toBe("2002-06-18T10:30:00");
    // The same controls stay on screen, now with a clock to put a zone on.
    expect(time()).toHaveValue("10:30:00");
    expect(offset()).toBeEnabled();
  });

  it("goes back to the bare date when the typed time is emptied", () => {
    render(<Field initial="2002-06-18" />);

    fireEvent.change(time(), { target: { value: "10:30" } });
    fireEvent.change(time(), { target: { value: "" } });

    expect(committed()).toBe("2002-06-18");
    expect(offset()).toBeDisabled();
  });

  it("takes the date-only shape when the value arrives after mount", () => {
    // The edit form mounts with `""` and resets to the dive once it loads.
    function Late() {
      const [value, setValue] = useState("");
      return (
        <>
          <button type="button" onClick={() => setValue("2002-06-18")}>
            load
          </button>
          <DiveStartTimeField value={value} onChange={setValue} />
        </>
      );
    }
    render(<Late />);

    fireEvent.click(screen.getByRole("button", { name: "load" }));

    expect(box()).toHaveValue("2002-06-18");
    expect(time()).toHaveValue("");
  });
});
