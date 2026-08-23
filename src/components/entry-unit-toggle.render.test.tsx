import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EntryUnitLabelRow, EntryUnitToggle } from "./entry-unit-toggle";

// The control is presentation over one boolean, so what is worth pinning is the
// part that is easy to get wrong and invisible on screen: the accessible name,
// which has to carry the visible text before it names the action, and the
// explicit `type` that stops it submitting the dive form it renders inside.

const toggle = () => screen.getByRole("button");

describe("EntryUnitToggle", () => {
  it("shows both systems for the dimension", () => {
    render(
      <EntryUnitToggle
        dimension="depth"
        entryUnits="metric"
        onToggle={vi.fn()}
      />,
    );

    expect(toggle()).toHaveTextContent("m | ft");
  });

  it("shows the pressure dimension's own pair", () => {
    render(
      <EntryUnitToggle
        dimension="pressure"
        entryUnits="metric"
        onToggle={vi.fn()}
      />,
    );

    expect(toggle()).toHaveTextContent("bar | psi");
  });

  // WCAG 2.5.3 (Label in Name): a speech-input user says the words they can see,
  // so an `aria-label` that overrides visible text has to contain it. Same rule
  // the export buttons follow.
  it("names the action after the text a diver can see", () => {
    render(
      <EntryUnitToggle
        dimension="depth"
        entryUnits="metric"
        onToggle={vi.fn()}
      />,
    );

    expect(toggle()).toHaveAccessibleName(
      "m | ft — switch depth entry to feet",
    );
  });

  it("names the way back once the flip has happened", () => {
    render(
      <EntryUnitToggle
        dimension="depth"
        entryUnits="imperial"
        onToggle={vi.fn()}
      />,
    );

    expect(toggle()).toHaveAccessibleName(
      "m | ft — switch depth entry to meters",
    );
  });

  // The spoken vocabulary, not the short label: "psi" reads as a word either way,
  // but "°F" would not, and this is the same `unitWord` the chart summaries use.
  it("speaks the temperature units rather than spelling them", () => {
    render(
      <EntryUnitToggle
        dimension="temperature"
        entryUnits="metric"
        onToggle={vi.fn()}
      />,
    );

    expect(toggle()).toHaveAccessibleName(
      "°C | °F — switch temperature entry to degrees Fahrenheit",
    );
  });

  it("highlights whichever system is on", () => {
    const { rerender } = render(
      <EntryUnitToggle
        dimension="depth"
        entryUnits="metric"
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("m")).toHaveClass("text-foreground");
    expect(screen.getByText("ft")).not.toHaveClass("text-foreground");

    rerender(
      <EntryUnitToggle
        dimension="depth"
        entryUnits="imperial"
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("ft")).toHaveClass("text-foreground");
    expect(screen.getByText("m")).not.toHaveClass("text-foreground");
  });

  // It renders inside the dive `<form>`, where a button's default type submits.
  it("is not a submit button", () => {
    render(
      <EntryUnitToggle
        dimension="depth"
        entryUnits="metric"
        onToggle={vi.fn()}
      />,
    );

    expect(toggle()).toHaveAttribute("type", "button");
  });

  it("asks for the flip when pressed", async () => {
    const onToggle = vi.fn();
    render(
      <EntryUnitToggle
        dimension="depth"
        entryUnits="metric"
        onToggle={onToggle}
      />,
    );

    await userEvent.click(toggle());

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

// The label row's alignment cannot be tested here, and pretending otherwise would be
// worse than not trying: jsdom does no layout, so every `getBoundingClientRect()` is
// zeroes and a geometry assertion passes against any markup at all - the same vacuous
// pass the storage helper exists to prevent. The alignment itself was measured in a
// real browser. What this pins is the three structural properties it rests on, each of
// which was a way of getting it wrong.
describe("EntryUnitLabelRow", () => {
  const row = () =>
    render(
      <EntryUnitLabelRow
        dimension="depth"
        entryUnits="metric"
        onToggle={vi.fn()}
      >
        <label htmlFor="x">Maximum depth (m)</label>
      </EntryUnitLabelRow>,
    );

  // The original defect. `<label>` is `display: inline`, and any flex or grid parent
  // blockifies its children - which shrank the label's box from its 17px inline
  // content area to the 14px line box `leading-none` declares, and handed the row's
  // height to the taller toggle instead.
  it("does not make the label a flex or grid item", () => {
    row();
    const wrapper = screen.getByText("Maximum depth (m)").parentElement!;

    expect(wrapper.className).not.toMatch(/\bflex\b/);
    expect(wrapper.className).not.toMatch(/\bgrid\b/);
  });

  // Which is only safe because the toggle is out of flow: in flow it would drive the
  // row's height again, whatever the display mode.
  it("takes the toggle out of flow", () => {
    row();
    const positioner = screen.getByRole("button").parentElement!;

    expect(positioner.className).toMatch(/\babsolute\b/);
    // And the row is what it is positioned against.
    expect(positioner.parentElement!.className).toMatch(/\brelative\b/);
  });

  // `FormItem` spaces its children with `space-y-2`, a margin-bottom on every child
  // but the last. Vertical margins do not apply to an inline box, so a bare
  // `FormLabel` never receives it - and any block wrapper would, pushing this field's
  // input below its neighbour's.
  it("cancels the margin a bare inline label would never receive", () => {
    row();
    const wrapper = screen.getByText("Maximum depth (m)").parentElement!;

    expect(wrapper.className).toMatch(/\bmb-0\b/);
  });

  it("still renders a working toggle", async () => {
    const onToggle = vi.fn();
    render(
      <EntryUnitLabelRow
        dimension="pressure"
        entryUnits="metric"
        onToggle={onToggle}
      >
        <label htmlFor="y">Start pressure (bar)</label>
      </EntryUnitLabelRow>,
    );

    await userEvent.click(
      screen.getByLabelText("bar | psi — switch pressure entry to psi"),
    );

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
