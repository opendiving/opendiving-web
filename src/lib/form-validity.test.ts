import { describe, expect, it } from "vitest";
import { describeBlockedSubmit, refusedControls } from "./form-validity";

// Built as real DOM rather than through a component, because what is under test is
// the browser's own constraint validation and not anything React does with it.
// Unique across the file, not per form: a `<label for>` resolves against the whole
// document, so a second form reusing `control-0` would have its label silently
// claimed by the first one still sitting in `document.body`.
let nextId = 0;

function formWith(
  ...controls: { attrs: Record<string, string>; label?: string }[]
): HTMLFormElement {
  const form = document.createElement("form");
  controls.forEach(({ attrs, label }) => {
    const input = document.createElement("input");
    input.id = `control-${nextId++}`;
    Object.entries(attrs).forEach(([key, value]) =>
      key === "value" ? (input.value = value) : input.setAttribute(key, value),
    );
    if (label !== undefined) {
      const element = document.createElement("label");
      element.htmlFor = input.id;
      element.textContent = label;
      form.appendChild(element);
    }
    form.appendChild(input);
  });
  document.body.appendChild(form);
  return form;
}

// The value out of the bug report: a float32 depth artefact the UDDF reader
// produces and the API stores unrounded. It is a `stepMismatch` against any step
// finer than itself, which is what used to cancel the save with nothing on screen.
const IMPORTED_DEPTH = "2.70000029";

describe("refusedControls", () => {
  it("finds nothing on a form the browser would submit", () => {
    const form = formWith({
      attrs: { type: "number", step: "any", value: IMPORTED_DEPTH },
    });

    expect(refusedControls(form)).toEqual([]);
    expect(describeBlockedSubmit(form)).toBeNull();
  });

  it("finds a step mismatch the diver never typed", () => {
    const form = formWith({
      attrs: { type: "number", step: "0.01", min: "0", value: IMPORTED_DEPTH },
    });

    expect(refusedControls(form)).toHaveLength(1);
  });

  // `willValidate` is false for a disabled control, and the browser skips it when
  // it decides whether to submit - so naming it would send the diver to a box they
  // cannot edit and that was never the reason.
  it("skips a control barred from validation", () => {
    const form = formWith({
      attrs: {
        type: "number",
        step: "0.01",
        value: IMPORTED_DEPTH,
        disabled: "",
      },
    });

    expect(refusedControls(form)).toEqual([]);
  });

  // Document order, because that is the order the browser picks from when it
  // chooses which one to focus - so the message names the field it lands on.
  it("returns them in document order", () => {
    const form = formWith(
      {
        attrs: { type: "number", max: "50", value: "78.8" },
        label: "Bottom temperature",
      },
      {
        attrs: { type: "number", step: "0.01", value: IMPORTED_DEPTH },
        label: "Average depth",
      },
    );

    const [first, second] = Array.from(form.elements) as HTMLElement[];
    expect(refusedControls(form)).toEqual([first, second]);
  });
});

describe("describeBlockedSubmit", () => {
  it("names the field by the label the diver is reading", () => {
    const form = formWith({
      attrs: { type: "number", step: "0.01", min: "0", value: IMPORTED_DEPTH },
      label: "Average depth (m)",
    });

    // The browser's own reason is appended and deliberately not asserted here:
    // engines word it differently, and jsdom words it differently again.
    expect(describeBlockedSubmit(form)).toContain("Average depth (m):");
    expect(describeBlockedSubmit(form)).toContain(
      "Your browser would not submit this form.",
    );
  });

  it("falls back to aria-label, then to the wire name", () => {
    const labelled = formWith({
      attrs: {
        type: "number",
        step: "0.01",
        value: IMPORTED_DEPTH,
        "aria-label": "Average depth",
      },
    });
    expect(describeBlockedSubmit(labelled)).toContain("Average depth:");

    const named = formWith({
      attrs: {
        type: "number",
        step: "0.01",
        value: IMPORTED_DEPTH,
        name: "avg_depth",
      },
    });
    expect(describeBlockedSubmit(named)).toContain("avg_depth:");
  });

  it("counts the fields it did not name", () => {
    const form = formWith(
      {
        attrs: { type: "number", step: "0.01", value: IMPORTED_DEPTH },
        label: "Average depth",
      },
      {
        attrs: { type: "number", max: "50", value: "78.8" },
        label: "Bottom temperature",
      },
      { attrs: { type: "number", min: "1", value: "0" }, label: "Dive number" },
    );

    expect(describeBlockedSubmit(form)).toContain(
      "2 other fields were also refused.",
    );
  });

  it("counts one other field in the singular", () => {
    const form = formWith(
      {
        attrs: { type: "number", step: "0.01", value: IMPORTED_DEPTH },
        label: "Average depth",
      },
      {
        attrs: { type: "number", max: "50", value: "78.8" },
        label: "Bottom temperature",
      },
    );

    expect(describeBlockedSubmit(form)).toContain(
      "1 other field was also refused.",
    );
  });
});
