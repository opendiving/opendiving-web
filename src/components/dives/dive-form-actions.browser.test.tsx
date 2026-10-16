import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { page } from "vitest/browser";

import { DiveFormActions } from "./dive-form-actions";

// The stylesheet holds the pin itself, and its release on a short viewport.
import "@/app/globals.css";

// A form that runs on past the screen, ending in the row: pinned to the foot of
// the screen while there is room, and in its place at the form's end while the
// visible height is under 30rem, which is what the keyboard leaves.
function renderLongForm() {
  const { container } = render(
    <>
      <form>
        <div style={{ height: "2000px" }} />
        <DiveFormActions
          cancelHref="/dives"
          mode="create"
          isSubmitting={false}
          submittingLabel="Logging..."
          submitLabel="Log dive"
        />
      </form>
      {/* The page's footer, which the form never ends flush against. */}
      <div style={{ height: "200px" }} />
    </>,
  );
  return container.querySelector<HTMLElement>("[data-dive-form-actions]")!;
}

const scrollPaddingBottom = () =>
  getComputedStyle(document.documentElement).scrollPaddingBottom;

describe("DiveFormActions", () => {
  it("pins to the foot of the screen, and lets go while the viewport is short", async () => {
    await page.viewport(390, 800);
    const row = renderLongForm();
    await expect.poll(() => row.hasAttribute("data-stuck")).toBe(true);

    expect(getComputedStyle(row).position).toBe("sticky");
    expect(row.getBoundingClientRect().bottom).toBeCloseTo(innerHeight, 0);
    expect(scrollPaddingBottom()).toBe("64px");

    // The keyboard coming up: the row goes back to the form's end, which is
    // off screen below, and the padding it reserved goes with it - although
    // its observer still reads a row below the fold as stuck.
    await page.viewport(390, 400);
    await expect.poll(() => getComputedStyle(row).position).toBe("static");
    expect(row.getBoundingClientRect().top).toBeGreaterThan(innerHeight);
    expect(scrollPaddingBottom()).toBe("auto");
    // And its surface, which fades out rather than vanishing.
    await expect
      .poll(() => getComputedStyle(row).backgroundColor)
      .toBe("rgba(0, 0, 0, 0)");

    await page.viewport(390, 800);
    await expect.poll(() => getComputedStyle(row).position).toBe("sticky");
    await expect.poll(() => row.hasAttribute("data-stuck")).toBe(true);
    expect(row.getBoundingClientRect().bottom).toBeCloseTo(innerHeight, 0);
  });

  it("rests at the form's end once scrolled there", async () => {
    await page.viewport(390, 800);
    const row = renderLongForm();
    await expect.poll(() => row.hasAttribute("data-stuck")).toBe(true);

    scrollTo(0, document.documentElement.scrollHeight);
    await expect.poll(() => row.hasAttribute("data-stuck")).toBe(false);
    expect(scrollPaddingBottom()).toBe("auto");
    scrollTo(0, 0);
  });
});
