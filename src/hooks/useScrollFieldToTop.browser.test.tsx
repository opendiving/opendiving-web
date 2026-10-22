import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { page } from "vitest/browser";

import { usePointer } from "@/test/pointer";
import { scrollFieldToTop, useScrollFieldToTop } from "./useScrollFieldToTop";

// Geometry, so the browser lane: jsdom lays nothing out and every rect is 0.
// The styles are inline rather than from `globals.css` so the padding each
// case scrolls under is the one it states.

const HEADER = 60;
// `TOP_GAP_REM` at the browser's 16px root.
const GAP = 8;

function Field() {
  return <input aria-label="Picker" />;
}

/** A picker with `after` pixels of page below it. */
function OnPage({ after = 2000 }: { after?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  useScrollFieldToTop(ref);
  return (
    <div>
      <div style={{ height: 900 }} />
      <input ref={ref} aria-label="Picker" />
      <div style={{ height: after }} />
    </div>
  );
}

/** A picker in a fixed box that scrolls, as `DialogContent` is. */
function InDialog() {
  const ref = useRef<HTMLInputElement>(null);
  useScrollFieldToTop(ref);
  return (
    <>
      <div style={{ height: 3000 }} />
      <div
        style={{ position: "fixed", top: 100, height: 300, overflowY: "auto" }}
      >
        <div style={{ height: 500 }} />
        <input ref={ref} aria-label="Picker" />
        <div style={{ height: 500 }} />
      </div>
    </>
  );
}

// Chromium's `Touch` needs a real touch-enabled context, so the events are
// plain ones carrying the two lists the hook reads - as in
// `useVisualViewport.test.tsx`.
function tap(target: Element) {
  const contact = { clientX: 40, clientY: 20, target };
  const fire = (type: "touchstart" | "touchend") => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      touches: { value: type === "touchend" ? [] : [contact] },
      changedTouches: { value: [contact] },
    });
    target.dispatchEvent(event);
    return event;
  };
  fire("touchstart");
  return fire("touchend");
}

afterEach(() => {
  document.documentElement.style.scrollPaddingTop = "";
  window.scrollTo(0, 0);
});

describe("scrollFieldToTop", () => {
  it("puts a field on the page at the top, under the header's padding", async () => {
    await page.viewport(393, 700);
    document.documentElement.style.scrollPaddingTop = `${HEADER}px`;
    const { getByLabelText } = render(<OnPage />);
    const input = getByLabelText("Picker");
    scrollFieldToTop(input);
    expect(input.getBoundingClientRect().top).toBeCloseTo(HEADER + GAP, 0);
  });

  it("stops below a section heading stuck under the header", async () => {
    await page.viewport(393, 700);
    document.documentElement.style.scrollPaddingTop = `${HEADER}px`;
    const { getByLabelText } = render(
      <div>
        <header style={{ position: "sticky", top: 0, height: HEADER }} />
        <div style={{ height: 900 }} />
        <section>
          <h2 style={{ position: "sticky", top: HEADER, height: 50 }} />
          <div style={{ height: 300 }} />
          <div>
            <Field />
          </div>
          <div style={{ position: "sticky", bottom: 0, height: 40 }} />
        </section>
        <div style={{ height: 2000 }} />
      </div>,
    );
    const input = getByLabelText("Picker");
    scrollFieldToTop(input);
    expect(input.getBoundingClientRect().top).toBeCloseTo(HEADER + 50 + GAP, 0);
  });

  it("brings the field's label up with it", async () => {
    await page.viewport(393, 700);
    document.documentElement.style.scrollPaddingTop = `${HEADER}px`;
    const { getByLabelText, getByText } = render(
      <div>
        <div style={{ height: 900 }} />
        <label htmlFor="picker" style={{ display: "block", height: 20 }}>
          Course
        </label>
        <div style={{ height: 10 }} />
        <input id="picker" />
        <div style={{ height: 2000 }} />
      </div>,
    );
    const input = getByLabelText("Course");
    scrollFieldToTop(input);
    expect(getByText("Course").getBoundingClientRect().top).toBeCloseTo(
      HEADER + GAP,
      0,
    );
    expect(input.getBoundingClientRect().top).toBeCloseTo(HEADER + GAP + 30, 0);
  });

  it("leaves the label behind when something sits between it and the field", async () => {
    await page.viewport(393, 700);
    document.documentElement.style.scrollPaddingTop = `${HEADER}px`;
    const { getByLabelText } = render(
      <div>
        <div style={{ height: 900 }} />
        <label htmlFor="picker" style={{ display: "block", height: 20 }}>
          Dive sites
        </label>
        <div style={{ height: 10 }} />
        <div>
          <ul style={{ height: 44, margin: 0 }} />
          <div style={{ height: 8 }} />
          <input id="picker" />
        </div>
        <div style={{ height: 2000 }} />
      </div>,
    );
    const input = getByLabelText("Dive sites");
    scrollFieldToTop(input);
    expect(input.getBoundingClientRect().top).toBeCloseTo(HEADER + GAP, 0);
  });

  it("scrolls a dialog's own box and leaves the page behind it alone", async () => {
    await page.viewport(393, 700);
    window.scrollTo(0, 0);
    const { getByLabelText } = render(
      <>
        <div style={{ height: 3000 }} />
        <div
          style={{
            position: "fixed",
            top: 100,
            height: 300,
            overflowY: "auto",
            scrollPaddingTop: 20,
          }}
        >
          <div style={{ height: 500 }} />
          <Field />
          <div style={{ height: 500 }} />
        </div>
      </>,
    );
    const input = getByLabelText("Picker");
    scrollFieldToTop(input);
    expect(input.getBoundingClientRect().top).toBeCloseTo(100 + 20 + GAP, 0);
    expect(window.scrollY).toBe(0);
  });
});

describe("useScrollFieldToTop", () => {
  it("leaves the page alone on focus alone, which comes too late for iOS", async () => {
    await page.viewport(393, 700);
    usePointer("coarse");
    const { getByLabelText } = render(<OnPage />);
    fireEvent.focus(getByLabelText("Picker"));
    expect(window.scrollY).toBe(0);
  });

  it("scrolls a dialog's box on focus, the dialog having taken the tap", async () => {
    await page.viewport(393, 700);
    usePointer("coarse");
    const { getByLabelText } = render(<InDialog />);
    const input = getByLabelText("Picker");
    fireEvent.focus(input);
    expect(input.getBoundingClientRect().top).toBeCloseTo(100 + GAP, 0);
    expect(window.scrollY).toBe(0);
  });

  it("leaves a dialog alone for a mouse", async () => {
    await page.viewport(393, 700);
    usePointer("fine");
    const { getByLabelText } = render(<InDialog />);
    const input = getByLabelText("Picker");
    fireEvent.focus(input);
    expect(input.getBoundingClientRect().top).toBeCloseTo(100 + 500, 0);
  });

  it("focuses a tapped picker in place, so Safari has no pan to make", async () => {
    await page.viewport(393, 700);
    usePointer("coarse");
    const { getByLabelText } = render(<OnPage />);
    const input = getByLabelText("Picker");
    let topAtFocus = Number.NaN;
    input.addEventListener("focus", () => {
      topAtFocus = input.getBoundingClientRect().top;
    });
    const end = tap(input);
    expect(end.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
    // Already up when focus arrives - see the hook for why that order matters.
    expect(topAtFocus).toBeCloseTo(GAP, 0);
  });

  it("leaves the tap to Safari where the page cannot scroll the picker up", async () => {
    await page.viewport(393, 700);
    usePointer("coarse");
    const { getByLabelText } = render(<OnPage after={100} />);
    const end = tap(getByLabelText("Picker"));
    expect(end.defaultPrevented).toBe(false);
  });

  it("leaves a mouse's tap alone", async () => {
    await page.viewport(393, 700);
    usePointer("fine");
    const { getByLabelText } = render(<OnPage />);
    const end = tap(getByLabelText("Picker"));
    expect(end.defaultPrevented).toBe(false);
  });
});
