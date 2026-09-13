import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVisualViewport } from "./useVisualViewport";

// jsdom has no `visualViewport` at all, which is the case the hook no-ops on -
// so everything below runs against a stand-in. What is worth pinning here is
// not the mirroring itself but the two rules that only bite with *two* dialogs
// open, which is the state a confirm raised from inside a form dialog puts the
// app in and the one nothing else in the suite reaches.

interface FakeViewport {
  height: number;
  offsetTop: number;
  listeners: Map<string, Set<EventListener>>;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  emit: (type: string) => void;
}

function installViewport(height = 700, offsetTop = 0): FakeViewport {
  const listeners = new Map<string, Set<EventListener>>();
  const viewport: FakeViewport = {
    height,
    offsetTop,
    listeners,
    addEventListener(type, listener) {
      const forType = listeners.get(type) ?? new Set<EventListener>();
      // A `Set`, matching the browser's own de-duplication of an identical
      // (type, listener) pair - which is the whole reason the hook registers a
      // closure of its own per caller rather than one shared function.
      forType.add(listener);
      listeners.set(type, forType);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type) {
      for (const listener of listeners.get(type) ?? []) {
        listener(new Event(type));
      }
    },
  };

  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  return viewport;
}

const vars = () => ({
  height: document.documentElement.style.getPropertyValue(
    "--visual-viewport-height",
  ),
  top: document.documentElement.style.getPropertyValue("--visual-viewport-top"),
});

afterEach(() => {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: undefined,
  });
  document.documentElement.removeAttribute("style");
});

describe("useVisualViewport", () => {
  it("mirrors the viewport while it is mounted, and cleans up after", () => {
    const viewport = installViewport(640, 0);
    const { unmount } = renderHook(() => useVisualViewport());

    expect(vars()).toEqual({ height: "640px", top: "0px" });

    // `scroll` rather than `resize`: an iOS keyboard moves the visual viewport
    // within an unchanged layout viewport, and `offsetTop` is the only thing
    // that reports it.
    act(() => {
      viewport.height = 380;
      viewport.offsetTop = 120;
      viewport.emit("scroll");
    });
    expect(vars()).toEqual({ height: "380px", top: "120px" });

    unmount();
    expect(vars()).toEqual({ height: "", top: "" });
  });

  it("keeps the variables while a second dialog is still open", () => {
    // The refcount. Without it the first dialog to close strips the variables
    // out from under the one still on screen, which snaps it back to the
    // `:root` fallback mid-interaction.
    const viewport = installViewport(700, 0);
    const first = renderHook(() => useVisualViewport());
    const second = renderHook(() => useVisualViewport());

    first.unmount();
    expect(vars()).toEqual({ height: "700px", top: "0px" });

    // And the survivor is still listening - the browser de-duplicates identical
    // (type, listener) pairs, so a shared handler would have been one
    // registration that the first unmount took away from everybody.
    act(() => {
      viewport.height = 420;
      viewport.emit("resize");
    });
    expect(vars().height).toBe("420px");

    second.unmount();
    expect(vars()).toEqual({ height: "", top: "" });
  });

  it("registers and releases one listener per caller, per event", () => {
    const viewport = installViewport();
    const first = renderHook(() => useVisualViewport());
    const second = renderHook(() => useVisualViewport());

    expect(viewport.listeners.get("resize")?.size).toBe(2);
    expect(viewport.listeners.get("scroll")?.size).toBe(2);

    first.unmount();
    second.unmount();
    expect(viewport.listeners.get("resize")?.size).toBe(0);
    expect(viewport.listeners.get("scroll")?.size).toBe(0);
  });

  it("leaves the `:root` fallback alone where there is no visual viewport", () => {
    // jsdom, and any browser old enough not to have the API. The variables are
    // defined in `globals.css` precisely so this case has something to use.
    const { unmount } = renderHook(() => useVisualViewport());

    expect(vars()).toEqual({ height: "", top: "" });
    unmount();
  });
});
