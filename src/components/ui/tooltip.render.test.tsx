import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";

// The whole point of the component is that one string is both halves of the
// label: what a screen reader announces and what a sighted pointer user reads.
// A version that showed the chip but dropped the `aria-label` would look right
// in a browser and name nothing, so both are asserted from the same string.
describe("IconTooltip", () => {
  const renderOne = () =>
    render(
      <IconTooltip label="Delete dive #12">
        <Button variant="ghost" size="sm">
          <Trash2 className="h-4 w-4" />
        </Button>
      </IconTooltip>,
    );

  it("names the button it wraps", () => {
    renderOne();

    expect(
      screen.getByRole("button", { name: "Delete dive #12" }),
    ).toBeInTheDocument();
  });

  it("shows the same words on hover", async () => {
    renderOne();
    const button = screen.getByRole("button", { name: "Delete dive #12" });

    // Radix opens on focus with no delay, and on `pointermove` only after one -
    // focus is the same open, reached without leaning on timers.
    fireEvent.focus(button);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Delete dive #12");
  });

  it("does not also describe the button with what it is already called", async () => {
    renderOne();
    const button = screen.getByRole("button", { name: "Delete dive #12" });

    fireEvent.focus(button);
    await screen.findByRole("tooltip");

    // Radix's default wiring points `aria-describedby` at the open tooltip,
    // which for a hint that repeats the name verbatim makes a screen reader say
    // it twice. `IconTooltip` suppresses it; this is the assertion that notices
    // if a Radix upgrade stops honouring the override.
    expect(button).not.toHaveAttribute("aria-describedby");
  });

  it("renders no wrapper element of its own", () => {
    const { container } = render(
      <div data-testid="row">
        <IconTooltip label="Clear">
          <button type="button">
            <Trash2 className="h-4 w-4" />
          </button>
        </IconTooltip>
      </div>,
    );

    // Several call sites absolutely position the button they wrap, or lay it out
    // as a flex child. An `IconTooltip` that emitted a `<span>` would move them.
    const row = container.querySelector('[data-testid="row"]');
    expect(row?.children).toHaveLength(1);
    expect(row?.firstElementChild?.tagName).toBe("BUTTON");
  });
});
