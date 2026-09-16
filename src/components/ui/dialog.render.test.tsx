import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { Input } from "./input";

// A press on the scrim must not be able to discard a half-filled form, which is
// the whole of what these cover. The opt-back-in case is the control: it proves
// the press below really reaches Radix's outside-interaction path, so the first
// test cannot pass by never having clicked anything.

// Radix registers its document `pointerdown` listener in a `setTimeout(0)` and
// runs the deferred outside event through another, so each dispatch needs a
// turn of the real event loop to land.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

// The scrim, which is the sibling Radix renders before the content and the only
// thing between a missed click and the page. It registers itself as a dismissal
// surface, so pressing it takes a different path through Radix than pressing
// anything else outside, and it is the path this guards.
//
// `fireEvent` rather than `userEvent`, because a modal dialog puts
// `pointer-events: none` on `body` and user-event refuses to click through it.
// Radix listens on the document, so the dispatch lands either way.
async function clickBackground() {
  const overlay = screen.getByRole("dialog").previousElementSibling;
  expect(overlay).not.toBeNull();

  fireEvent.pointerDown(overlay!, { button: 0 });
  fireEvent.click(overlay!, { button: 0 });
  await settle();
  await settle();
}

function open(props: Partial<React.ComponentProps<typeof DialogContent>> = {}) {
  const onOpenChange = vi.fn();
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent {...props}>
        <DialogTitle>Edit dive</DialogTitle>
        <Input aria-label="Notes" />
      </DialogContent>
    </Dialog>,
  );
  return { onOpenChange };
}

describe("DialogContent dismissal", () => {
  it("keeps the dialog and what is typed in it when the background is clicked", async () => {
    const { onOpenChange } = open();
    await settle();
    await userEvent.type(screen.getByLabelText("Notes"), "Thermocline at 18m");

    await clickBackground();

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Notes")).toHaveValue("Thermocline at 18m");
  });

  it("still closes for a dialog that opts back in", async () => {
    const { onOpenChange } = open({ onPointerDownOutside: () => {} });
    await settle();

    await clickBackground();

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("still closes on Escape", async () => {
    const { onOpenChange } = open();
    await settle();

    fireEvent.keyDown(screen.getByLabelText("Notes"), { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
