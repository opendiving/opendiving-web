import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedSearch } from "./useDebouncedSearch";

describe("useDebouncedSearch", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asks for the trimmed box once typing pauses", () => {
    const { result } = renderHook(() => useDebouncedSearch());

    act(() => result.current.setInput(" blue "));
    expect(result.current.input).toBe(" blue ");
    expect(result.current.term).toBe("");

    act(() => vi.advanceTimersByTime(249));
    expect(result.current.term).toBe("");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.term).toBe("blue");
  });

  it("restarts the wait on every keystroke", () => {
    const { result } = renderHook(() => useDebouncedSearch());

    act(() => result.current.setInput("b"));
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.setInput("bl"));
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.term).toBe("");

    act(() => vi.advanceTimersByTime(50));
    expect(result.current.term).toBe("bl");
  });
});
