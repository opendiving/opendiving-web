import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import { useIsEmptyList } from "./list-card-header";

// The latch is the whole subject: it has to span the render in which a cleared
// term has outrun the rows it selected, and no more than that - a card that stays
// headed for the rest of the visit puts a count and a search box over "No trips
// yet", which is what the header drops in the first place.

const empty = (isLoading: boolean, count: number, isNarrowed: boolean) => ({
  isLoading,
  count,
  isNarrowed,
});

describe("useIsEmptyList", () => {
  it("is true only for a list with nothing in it and nothing narrowing it", () => {
    expect(
      renderHook(() => useIsEmptyList(empty(false, 0, false))).result.current,
    ).toBe(true);
    expect(
      renderHook(() => useIsEmptyList(empty(true, 0, false))).result.current,
    ).toBe(false);
    expect(
      renderHook(() => useIsEmptyList(empty(false, 3, false))).result.current,
    ).toBe(false);
    expect(
      renderHook(() => useIsEmptyList(empty(false, 0, true))).result.current,
    ).toBe(false);
  });

  it("holds through the render where a cleared term outruns its rows", () => {
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useIsEmptyList>[0]) => useIsEmptyList(props),
      { initialProps: empty(false, 0, true) },
    );

    rerender(empty(false, 0, false));

    expect(result.current).toBe(false);
  });

  it("lets go once the refetch that term started is in flight", () => {
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useIsEmptyList>[0]) => useIsEmptyList(props),
      { initialProps: empty(false, 0, true) },
    );

    rerender(empty(false, 0, false));
    rerender(empty(true, 0, false));
    rerender(empty(false, 0, false));

    expect(result.current).toBe(true);
  });

  it("lets go on the rows a cleared term brings back, so a later delete still empties the card", () => {
    const { result, rerender } = renderHook(
      (props: Parameters<typeof useIsEmptyList>[0]) => useIsEmptyList(props),
      { initialProps: empty(false, 3, true) },
    );

    rerender(empty(false, 3, false));
    rerender(empty(false, 0, false));

    expect(result.current).toBe(true);
  });
});
