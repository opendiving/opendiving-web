import { act } from "react";
import { afterEach, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiveFormActions } from "./dive-form-actions";
import { pinToBottom, reveal, scrollPast } from "@/test/intersection";

// Whether the row is pinned is the observer's answer, so `pinToBottom` stands in
// for the form running on below the screen and `reveal` for the row sitting in
// its place at the form's end.

function renderActions(error: string | null = null) {
  render(
    <DiveFormActions
      cancelHref="/dives"
      mode="create"
      isSubmitting={false}
      submittingLabel="Logging..."
      submitLabel="Log dive"
      error={error}
    />,
  );
  return screen
    .getByRole("button", { name: "Log dive" })
    .closest("[data-dive-form-actions]")!;
}

describe("DiveFormActions", () => {
  it("marks itself stuck only while pinned to the foot of the screen", () => {
    const row = renderActions();
    expect(row).not.toHaveAttribute("data-stuck");

    act(() => pinToBottom());
    expect(row).toHaveAttribute("data-stuck");

    act(() => reveal());
    expect(row).not.toHaveAttribute("data-stuck");

    act(() => pinToBottom());
    act(() => scrollPast());
    expect(row).not.toHaveAttribute("data-stuck");
  });

  it("carries a refused submit above its buttons, pinned or not", () => {
    const row = renderActions("Your browser would not submit this form.");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Your browser would not submit this form.");
    expect(row).toContainElement(alert);
    expect(
      alert.compareDocumentPosition(
        screen.getByRole("button", { name: "Log dive" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  describe("on a short viewport", () => {
    const original = window.visualViewport;
    afterEach(() => {
      Object.defineProperty(window, "visualViewport", {
        value: original,
        configurable: true,
      });
    });

    it("marks the root for as long as it is on the page", () => {
      // The mark is what lets go of the pin in `globals.css`, and the form has
      // no dialog open to set it: with the keyboard up the row sat on the
      // layout viewport's foot, mid-screen over the field being typed into.
      Object.defineProperty(window, "visualViewport", {
        value: Object.assign(new EventTarget(), { height: 320, offsetTop: 0 }),
        configurable: true,
      });
      const { unmount } = render(
        <DiveFormActions
          cancelHref="/dives"
          mode="edit"
          isSubmitting={false}
          submittingLabel="Saving..."
          submitLabel="Save"
        />,
      );
      const root = document.documentElement;
      expect(root).toHaveAttribute("data-visual-viewport-short");

      unmount();
      expect(root).not.toHaveAttribute("data-visual-viewport-short");
    });
  });
});
