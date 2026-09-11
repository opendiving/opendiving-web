import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// Without this the `sr-only` below is an unstyled class and the visibility
// assertion passes against exactly the markup it was written to reject - see
// CONTRIBUTING.md and "jsdom answers no layout question" in DECISIONS.md.
import "@/app/globals.css";
import { FormApiError } from "@/components/ui/form-api-error";
import { describeBlockedSubmit } from "./form-validity";

// What only a real engine answers. jsdom implements constraint validation well
// enough to reproduce the cancelled submit, and the unit tests use it for exactly
// that - but its `validationMessage` is the generic "Constraints not satisfied",
// so whether a diver is left with anything *readable* is a question only Chromium
// can settle. The same goes for `sr-only`, which is a stylesheet rule.

const IMPORTED_AVG_DEPTH = "2.70000029";

function Harness({ step }: { step: string }) {
  const [blocked, setBlocked] = useState<string | null>(null);
  const onSubmit = vi.fn();

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const message = describeBlockedSubmit(event.currentTarget);
        setBlocked(message);
        if (message === null) onSubmit();
      }}
    >
      <label htmlFor="avg">Average depth (m)</label>
      <input
        id="avg"
        type="number"
        step={step}
        min={0}
        defaultValue={IMPORTED_AVG_DEPTH}
      />
      <FormApiError error={blocked} />
      <button type="submit">Save Changes</button>
    </form>
  );
}

describe("a step finer than the stored value, in a real browser", () => {
  it("refuses the value the old step declared", async () => {
    render(<Harness step="0.01" />);
    const box = screen.getByLabelText("Average depth (m)") as HTMLInputElement;

    expect(box.validity.stepMismatch).toBe(true);
    // Chromium spells out the two values it would accept. Asserted loosely, and
    // only here: this wording is the browser's and may change under us.
    expect(box.validationMessage).not.toBe("");

    await userEvent.click(screen.getByText("Save Changes"));

    // The whole point: readable, on screen, and naming the field.
    // Laid out as ordinary text, not clipped away. Width rather than the class,
    // because the class is the thing under test: `sr-only` collapses the box to a
    // 1px square, so this is the assertion that fails if the rule stops applying.
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Average depth (m):");
    expect(alert.getBoundingClientRect().width).toBeGreaterThan(100);
  });

  it("accepts it once no step is declared", async () => {
    render(<Harness step="any" />);
    const box = screen.getByLabelText("Average depth (m)") as HTMLInputElement;

    expect(box.validity.stepMismatch).toBe(false);

    await userEvent.click(screen.getByText("Save Changes"));

    // Still mounted, still a live region, and saying nothing - which is what
    // keeps a later message announced rather than read on insertion.
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("");
    expect(alert.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  });
});
