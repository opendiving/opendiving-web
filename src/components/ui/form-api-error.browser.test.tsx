import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { FormApiError } from "./form-api-error";

// **Load-bearing, and it looks like a stray import** - the same one
// `map-picker.browser.test.tsx` documents. Nothing in the browser project loads this
// app's Tailwind, and every assertion below is about what `sr-only`, `space-y-4`,
// `gap-4` and `text-sm` compute to. Without it they compute to nothing and all four
// tests pass vacuously.
import "@/app/globals.css";

// This file exists because the fix had two halves and jsdom can only see one of them.
// `FormApiError` made the error region *permanent* so a screen reader registers it
// before the message lands in it; the condition on that was that it must not change
// what anyone sees. That is a claim about layout, and "jsdom answers no layout
// question" (DECISIONS.md) - only this lane can hold it.
//
// The comparison is always against the markup that was actually there before:
// nothing at all while `apiError` was null, and a plain
// `<p className="text-sm text-destructive">` once it was set.
//
// Measuring turned up something worth writing down. In `space-y-4`, which is what
// every dialog form here uses, an empty *visible* <p> would have been free too -
// its zero height lets the margins either side collapse through it, so the gap is
// 16px whether the node is absent, `sr-only` or a plain empty paragraph. The choice
// only becomes observable in a `gap`-based flex column, where there is no margin
// collapsing and an in-flow empty node costs a whole extra 16px. Both container
// kinds are in use - the dialogs are `space-y-4`, `NotificationsCard` and
// `UnitsCard` sit in a `CardContent` with the message spaced by `mt-3` - so the
// out-of-flow test below is done in the container that can actually see the
// difference, and it is what makes the component safe to drop into either.

const OLD_CLASS = "text-sm text-destructive";
const MESSAGE = "A dive site with this name already exists at this location";

const DIALOG_FORM = "space-y-4";
const GAP_FORM = "flex flex-col gap-4";

// The two blocks the error sits between in every dialog: a last field, then the
// footer.
function measure(layout: string, node: React.ReactNode) {
  const { container, unmount } = render(
    <form className={layout} style={{ width: "400px" }}>
      <div data-testid="field" style={{ height: "40px" }} />
      {node}
      <div data-testid="footer" style={{ height: "40px" }} />
    </form>,
  );
  const field = container.querySelector('[data-testid="field"]')!;
  const footer = container.querySelector('[data-testid="footer"]')!;
  const form = container.querySelector("form")!;
  // Measure *before* unmounting: `unmount()` detaches the container, and a detached
  // element's bounding rect is all zeros - so a read afterwards would compare two
  // sets of zeros and pass no matter what the component did.
  const measured = {
    gap:
      footer.getBoundingClientRect().top - field.getBoundingClientRect().bottom,
    formHeight: form.getBoundingClientRect().height,
  };
  unmount();
  return measured;
}

describe("FormApiError leaves the layout alone", () => {
  it("is out of flow while it has nothing to say", () => {
    // In a `gap` column an in-flow empty node is not free, so this is the harness
    // that can tell `sr-only` from a plain empty paragraph.
    const withoutRegion = measure(GAP_FORM, null);
    const withRegion = measure(GAP_FORM, <FormApiError error={null} />);

    expect(withRegion).toEqual(withoutRegion);
  });

  it("costs the dialog forms nothing either", () => {
    const withoutRegion = measure(DIALOG_FORM, null);
    const withRegion = measure(DIALOG_FORM, <FormApiError error={null} />);

    expect(withRegion).toEqual(withoutRegion);
  });

  it("occupies exactly what the conditional paragraph used to", () => {
    const oldMarkup = measure(
      DIALOG_FORM,
      <p className={OLD_CLASS}>{MESSAGE}</p>,
    );
    const newMarkup = measure(DIALOG_FORM, <FormApiError error={MESSAGE} />);

    expect(newMarkup).toEqual(oldMarkup);
  });

  it("pushes the footer down once there is a message", () => {
    // Without this the test above could be comparing two invisible things and
    // still pass.
    const silent = measure(DIALOG_FORM, <FormApiError error={null} />);
    const speaking = measure(DIALOG_FORM, <FormApiError error={MESSAGE} />);

    expect(speaking.formHeight).toBeGreaterThan(silent.formHeight);
  });
});
