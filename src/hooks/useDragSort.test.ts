import { describe, it, expect } from "vitest";
import { moveItem, resolveSwapTarget } from "./useDragSort";

// Three 20px rows with a 4px gap between them, as the list actually renders.
const ROWS = [
  { top: 100, bottom: 120 },
  { top: 124, bottom: 144 },
  { top: 148, bottom: 168 },
];

describe("resolveSwapTarget", () => {
  it("stays put while the dragged row overlaps its neighbours by less than half", () => {
    // Row 1's own centre is 134.
    expect(resolveSwapTarget(ROWS, 1, 134)).toBe(1);
    expect(resolveSwapTarget(ROWS, 1, 128)).toBe(1);
    expect(resolveSwapTarget(ROWS, 1, 140)).toBe(1);
  });

  it("swaps up once the dragged centre passes the centre of the row above", () => {
    // Row 0's centre is 110.
    expect(resolveSwapTarget(ROWS, 1, 109)).toBe(0);
  });

  it("swaps down once the dragged centre passes the centre of the row below", () => {
    // Row 2's centre is 158.
    expect(resolveSwapTarget(ROWS, 1, 159)).toBe(2);
  });

  it("walks past every neighbour the row has cleared, not just one", () => {
    // A quick flick emits only a handful of pointermove events; single-stepping
    // would leave the list crawling along behind the pointer.
    expect(resolveSwapTarget(ROWS, 0, 9999)).toBe(2);
    expect(resolveSwapTarget(ROWS, 2, -9999)).toBe(0);
  });

  it("parks at the ends instead of losing the row", () => {
    // Dragged above the top while already first, or below the bottom while
    // already last: no neighbour to swap with, and nothing breaks.
    expect(resolveSwapTarget(ROWS, 0, -9999)).toBe(0);
    expect(resolveSwapTarget(ROWS, 2, 9999)).toBe(2);
  });

  it("tolerates rows that have not mounted yet", () => {
    // Refs are null on the first render pass and briefly during reordering.
    expect(resolveSwapTarget([null, ROWS[1], null], 1, 0)).toBe(1);
  });

  it("handles a single-item list", () => {
    expect(resolveSwapTarget([ROWS[0]], 0, 9999)).toBe(0);
  });
});

describe("moveItem", () => {
  it("moves an item down", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("moves an item up", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("moves an item by one, the drag/keyboard step case", () => {
    expect(moveItem(["a", "b", "c"], 1, 0)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 2)).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the original array", () => {
    const original = ["a", "b", "c"];

    moveItem(original, 0, 2);

    // The dive form holds this array in React Hook Form state, so mutating it
    // in place would leave the form unaware anything changed.
    expect(original).toEqual(["a", "b", "c"]);
  });

  it("returns the same reference for a no-op move", () => {
    const original = ["a", "b", "c"];

    // Dragging within one row fires repeatedly; returning the same array keeps
    // that from queueing a pointless state update on every pointermove.
    expect(moveItem(original, 1, 1)).toBe(original);
  });

  it("ignores out-of-range indices rather than dropping items", () => {
    const original = ["a", "b", "c"];

    expect(moveItem(original, -1, 1)).toBe(original);
    expect(moveItem(original, 0, 3)).toBe(original);
    expect(moveItem(original, 5, 0)).toBe(original);
  });

  it("handles a single-item list", () => {
    expect(moveItem(["a"], 0, 0)).toEqual(["a"]);
  });
});
