import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { page } from "vitest/browser";

import { Button } from "./button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "./dialog";

// The stylesheet holds the pin itself, and its release on a short viewport.
import "@/app/globals.css";

// Where the footer sits is a layout question, so this lane measures it: pinned
// flush with the dialog's bottom edge while the content runs on, resting at the
// end once scrolled there, and back at the end of the form - not pinned - while
// the visible height is under 30rem, which is what the keyboard leaves.

function openLongDialog() {
  render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>Edit certification</DialogTitle>
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
  const footer = dialog.querySelector<HTMLElement>("[data-dialog-footer]")!;
  return { dialog, footer };
}

// The dialog's padding edge, which its overflow clips to: the border box less
// the 1px border.
const paddingBottom = (dialog: HTMLElement) =>
  dialog.getBoundingClientRect().bottom - 1;

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
