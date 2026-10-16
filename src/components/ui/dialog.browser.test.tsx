import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { page } from "vitest/browser";

import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

// The stylesheet holds the pin itself, and its release on a short viewport.
import "@/app/globals.css";

// Where the header and footer sit is a layout question, so this lane measures
// it: each pinned flush with its edge of the dialog while the content runs on
// past it, resting in its own place once scrolled to that end, and not pinned
// at all while the visible height is under 30rem, which is what the keyboard
// leaves.

function openLongDialog() {
  render(
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit certification</DialogTitle>
        </DialogHeader>
        <form>
          <div style={{ height: "2000px" }} />
          <DialogFooter>
            <Button type="submit">Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>,
  );
  const dialog = screen.getByRole("dialog");
  const header = dialog.querySelector<HTMLElement>("[data-dialog-header]")!;
  const footer = dialog.querySelector<HTMLElement>("[data-dialog-footer]")!;
  const close = screen.getByRole("button", { name: "Close" });
  return { dialog, header, footer, close };
}

// The padding edge at the top, likewise.
const paddingTop = (dialog: HTMLElement) =>
  dialog.getBoundingClientRect().top + 1;

// The dialog's padding edge, which its overflow clips to: the border box less
// the 1px border.
const paddingBottom = (dialog: HTMLElement) =>
  dialog.getBoundingClientRect().bottom - 1;

describe("DialogHeader", () => {
  it("rests at the dialog's top edge, and pins there with the cross while the content scrolls", async () => {
    await page.viewport(390, 800);
    const { dialog, header, close } = openLongDialog();
    await expect.poll(() => getComputedStyle(header).position).toBe("sticky");
    // The resting place is measured, so the zoom the dialog opens with is let
    // finish first.
    await Promise.all(dialog.getAnimations().map((a) => a.finished));

    expect(header.hasAttribute("data-stuck")).toBe(false);
    expect(header.getBoundingClientRect().top).toBeCloseTo(
      paddingTop(dialog),
      0,
    );
    // Where the cross sat as a child of the dialog itself.
    const restingClose = close.getBoundingClientRect();
    expect(restingClose.top).toBeCloseTo(paddingTop(dialog) + 16, 0);

    dialog.scrollTop = 600;
    await expect.poll(() => header.hasAttribute("data-stuck")).toBe(true);

    // Two pixels past the edge, by design - see `globals.css`.
    expect(header.getBoundingClientRect().top).toBeCloseTo(
      paddingTop(dialog) - 2,
      0,
    );
    expect(close.getBoundingClientRect().top).toBeCloseTo(
      restingClose.top - 2,
      0,
    );
    expect(
      document.elementFromPoint(restingClose.x + 4, restingClose.y + 4),
    ).toSatisfy((hit: Element | null) => close.contains(hit));
    await expect
      .poll(() => parseFloat(getComputedStyle(dialog).scrollPaddingTop))
      .toBe(header.offsetHeight + 16);

    dialog.scrollTop = 0;
    await expect.poll(() => header.hasAttribute("data-stuck")).toBe(false);
    expect(getComputedStyle(dialog).scrollPaddingTop).toBe("auto");
  });

  it("lets go of the top while the visible height is short, and pins again with room", async () => {
    await page.viewport(390, 400);
    const { dialog, header, close } = openLongDialog();
    await expect.poll(() => getComputedStyle(header).position).toBe("relative");

    dialog.scrollTop = 600;
    await expect
      .poll(() => header.getBoundingClientRect().bottom)
      .toBeLessThan(paddingTop(dialog));
    expect(header.hasAttribute("data-stuck")).toBe(false);
    expect(getComputedStyle(dialog).scrollPaddingTop).toBe("auto");
    // Still the header's, and gone with it.
    expect(close.getBoundingClientRect().bottom).toBeLessThan(
      paddingTop(dialog),
    );

    await page.viewport(390, 800);
    await expect.poll(() => getComputedStyle(header).position).toBe("sticky");
    await expect
      .poll(() => header.getBoundingClientRect().top)
      .toBeCloseTo(paddingTop(dialog) - 2, 0);
  });
});

describe("DialogFooter", () => {
  it("pins to the dialog's bottom edge while the content runs on, and rests at its end", async () => {
    await page.viewport(390, 800);
    const { dialog, footer } = openLongDialog();
    await expect.poll(() => footer.hasAttribute("data-stuck")).toBe(true);

    expect(getComputedStyle(footer).position).toBe("sticky");
    // Two pixels past the edge, by design - see `globals.css`.
    expect(footer.getBoundingClientRect().bottom).toBeCloseTo(
      paddingBottom(dialog) + 2,
      0,
    );
    await expect
      .poll(() => parseFloat(getComputedStyle(dialog).scrollPaddingBottom))
      .toBe(footer.offsetHeight + 16);

    dialog.scrollTop = dialog.scrollHeight;
    await expect.poll(() => footer.hasAttribute("data-stuck")).toBe(false);

    expect(footer.getBoundingClientRect().bottom).toBeCloseTo(
      paddingBottom(dialog),
      0,
    );
  });

  it("lets go of the foot while the visible height is short, and pins again with room", async () => {
    await page.viewport(390, 400);
    const { dialog, footer } = openLongDialog();
    await expect.poll(() => getComputedStyle(footer).position).toBe("static");
    expect(getComputedStyle(dialog).scrollPaddingBottom).toBe("auto");
    expect(footer.getBoundingClientRect().top).toBeGreaterThan(
      paddingBottom(dialog),
    );

    await page.viewport(390, 800);
    await expect.poll(() => getComputedStyle(footer).position).toBe("sticky");
    expect(footer.getBoundingClientRect().bottom).toBeCloseTo(
      paddingBottom(dialog) + 2,
      0,
    );
  });
});
