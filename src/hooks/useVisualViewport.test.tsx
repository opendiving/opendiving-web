import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useKeepFocusedFieldVisible,
  useVisualViewport,
} from "./useVisualViewport";

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

describe("useKeepFocusedFieldVisible", () => {
  // A field at the foot of a box that shrinks under it, which is the Configure
  // dialog on a phone: `DialogContent` scrolls its own content, so the browser
  // reveals a field inside *it* rather than inside the page.
  function mountField({ shrinkAfterFrames = 0 } = {}) {
    const container = document.createElement("div");
    // The hook finds the scroll container by walking up for this, and jsdom
    // reports back whatever is set inline.
    container.style.overflowY = "auto";
    const field = document.createElement("input");
    container.append(field);
    document.body.append(container);
    field.focus();

    // jsdom implements neither, and both are the whole of what the hook does.
    const revealed: number[] = [];
    let frames = 0;
    let height = 780;
    Object.defineProperty(container, "clientHeight", { get: () => height });
    field.scrollIntoView = () => revealed.push(height);

    // The dialog's `transition: all 200ms` animating `max-height` down, which is
    // why one frame's answer is not the final one - and why the first frames
    // after the event report the height the box still had.
    const tick = () => {
      frames += 1;
      if (frames > shrinkAfterFrames) height = 388;
    };
    return {
      container,
      field,
      revealed,
      tick,
      cleanup: () => container.remove(),
    };
  }

  /** Runs `count` animation frames, calling `tick` before each. */
  async function runFrames(tick: () => void, count: number) {
    for (let i = 0; i < count; i += 1) {
      tick();
      await act(async () => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => resolve(null)),
        );
      });
    }
  }

  it("keeps re-revealing until the box it scrolls inside stops moving", async () => {
    // The bug this exists for: two frames after the event the dialog was still
    // 770px of an eventual 388px, the field was comfortably inside it, and a
    // single `block: "nearest"` call read that as "nothing to do".
    const viewport = installViewport(812, 0);
    const { field, revealed, tick, cleanup } = mountField({
      shrinkAfterFrames: 3,
    });
    const { unmount } = renderHook(() => useKeepFocusedFieldVisible());

    act(() => {
      viewport.height = 420;
      viewport.emit("resize");
    });
    await runFrames(tick, 24);

    // It kept going while the height was changing, and the last reveal it did
    // was against the settled box rather than the one mid-transition.
    expect(revealed.length).toBeGreaterThan(1);
    expect(revealed[revealed.length - 1]).toBe(388);

    unmount();
    cleanup();
    expect(field).toBeDefined();
  });

  it("stops once the height holds still, rather than running forever", async () => {
    const viewport = installViewport(812, 0);
    const { revealed, tick, cleanup } = mountField();
    const { unmount } = renderHook(() => useKeepFocusedFieldVisible());

    act(() => {
      viewport.height = 420;
      viewport.emit("resize");
    });
    // Past the minimum window, by which point a box that never moved at all has
    // long since satisfied the stability test.
    await runFrames(tick, 24);
    const settled = revealed.length;
    expect(settled).toBeLessThan(24);

    await runFrames(tick, 8);
    expect(revealed.length).toBe(settled);

    unmount();
    cleanup();
  });

  it("outlasts a transition that is slow to start", async () => {
    // The reason there is a minimum window at all. "Same height as last frame"
    // is true before the box starts moving as well as after it has stopped, so
    // a loop that trusted it immediately would give up during the pause and
    // correct nothing - which is the bug, not a lesser version of it.
    const viewport = installViewport(812, 0);
    const { revealed, tick, cleanup } = mountField({ shrinkAfterFrames: 10 });
    const { unmount } = renderHook(() => useKeepFocusedFieldVisible());

    act(() => {
      viewport.height = 420;
      viewport.emit("resize");
    });
    await runFrames(tick, 30);

    expect(revealed[revealed.length - 1]).toBe(388);

    unmount();
    cleanup();
  });

  it("leaves the scroll alone when the focus is not in a field", async () => {
    // Radix parks the focus on the dialog itself on open, and a resize then is
    // the toolbars sliding - not something to move the content for.
    const viewport = installViewport(812, 0);
    const { field, revealed, tick, cleanup } = mountField();
    field.blur();
    const { unmount } = renderHook(() => useKeepFocusedFieldVisible());

    act(() => {
      viewport.height = 420;
      viewport.emit("resize");
    });
    await runFrames(tick, 4);

    expect(revealed).toEqual([]);
    unmount();
    cleanup();
  });

  it("ignores `scroll`, which is Safari panning to a field the diver is in", async () => {
    const viewport = installViewport(812, 0);
    const { revealed, tick, cleanup } = mountField();
    const { unmount } = renderHook(() => useKeepFocusedFieldVisible());

    act(() => {
      viewport.offsetTop = 120;
      viewport.emit("scroll");
    });
    await runFrames(tick, 4);

    expect(revealed).toEqual([]);
    unmount();
    cleanup();
  });

  it("no-ops where there is no visual viewport", () => {
    const { cleanup } = mountField();
    const { unmount } = renderHook(() => useKeepFocusedFieldVisible());
    unmount();
    cleanup();
  });
});
