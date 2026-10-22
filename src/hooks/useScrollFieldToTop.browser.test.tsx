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

function Field({ onFocus }: { onFocus?: (field: HTMLElement) => void }) {
  return (
    <input
      aria-label="Picker"
      onFocus={onFocus && ((e) => onFocus(e.currentTarget))}
    />
  );
}

function OnPage() {
  const scrollToTop = useScrollFieldToTop();
  return (
    <div>
      <div style={{ height: 900 }} />
      <Field onFocus={scrollToTop} />
      <div style={{ height: 2000 }} />
    </div>
  );
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
  it("scrolls on focus where a finger is driving", async () => {
    await page.viewport(393, 700);
    usePointer("coarse");
    const { getByLabelText } = render(<OnPage />);
    const input = getByLabelText("Picker");
    fireEvent.focus(input);
    expect(input.getBoundingClientRect().top).toBeCloseTo(GAP, 0);
  });

  it("leaves the page where it is for a mouse", async () => {
    await page.viewport(393, 700);
    usePointer("fine");
    const { getByLabelText } = render(<OnPage />);
    const input = getByLabelText("Picker");
    fireEvent.focus(input);
    expect(window.scrollY).toBe(0);
  });
});
