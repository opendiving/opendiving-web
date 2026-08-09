import { describe, it, expect } from "vitest";
import { nextActiveIndex } from "./creatable-combobox";

describe("nextActiveIndex", () => {
  it("enters the list from the top on Down and the bottom on Up", () => {
    // -1 is "nothing highlighted", the state the menu opens in.
    expect(nextActiveIndex(-1, 1, 5)).toBe(0);
    expect(nextActiveIndex(-1, -1, 5)).toBe(4);
  });

  it("steps through the list", () => {
    expect(nextActiveIndex(0, 1, 5)).toBe(1);
    expect(nextActiveIndex(3, 1, 5)).toBe(4);
    expect(nextActiveIndex(3, -1, 5)).toBe(2);
  });

  it("clamps at both ends rather than wrapping", () => {
    // Running off a long list and silently reappearing at the other end is
    // disorienting, so the highlight parks instead.
    expect(nextActiveIndex(4, 1, 5)).toBe(4);
    expect(nextActiveIndex(0, -1, 5)).toBe(0);
  });

  it("has nothing to highlight in an empty list", () => {
    // e.g. a filter that matches no items - Enter should then fall back to
    // committing the typed text, which -1 signals.
    expect(nextActiveIndex(-1, 1, 0)).toBe(-1);
    expect(nextActiveIndex(2, 1, 0)).toBe(-1);
  });

  it("handles a single option", () => {
    expect(nextActiveIndex(-1, 1, 1)).toBe(0);
    expect(nextActiveIndex(0, 1, 1)).toBe(0);
    expect(nextActiveIndex(0, -1, 1)).toBe(0);
  });

  it("recovers from an index left over from a longer list", () => {
    // Typing re-filters the options; the component resets the highlight, but
    // the maths must not return an out-of-range index even if it didn't.
    expect(nextActiveIndex(9, 1, 3)).toBe(2);
    expect(nextActiveIndex(9, -1, 3)).toBe(2);
  });
});
