import { afterEach, describe, expect, it, vi } from "vitest";

import { swallowClickOf } from "./swallow-click";

// jsdom has no `PointerEvent`; the helper reads nothing but the type and the id.
const pointer = (type: string, pointerId: number) =>
  Object.assign(new Event(type, { bubbles: true }), { pointerId });

function clickOn(target: HTMLElement): { followed: boolean } {
  const onClick = vi.fn();
  target.addEventListener("click", onClick);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  target.dispatchEvent(click);
  target.removeEventListener("click", onClick);
  return { followed: onClick.mock.calls.length > 0 && !click.defaultPrevented };
}

describe("swallowClickOf", () => {
  const link = document.createElement("a");
  document.body.append(link);

  afterEach(() => {
    // Whatever a test left listening lapses with its press.
    document.dispatchEvent(pointer("pointercancel", 1));
    vi.useRealTimers();
  });

  it("swallows the click the press sends", () => {
    swallowClickOf({ pointerId: 1 });
    document.dispatchEvent(pointer("pointerup", 1));

    expect(clickOn(link).followed).toBe(false);
  });

  it("swallows that one click and no other", () => {
    swallowClickOf({ pointerId: 1 });
    clickOn(link);

    expect(clickOn(link).followed).toBe(true);
  });

  it("lapses when the press turns into a scroll", () => {
    swallowClickOf({ pointerId: 1 });
    document.dispatchEvent(pointer("pointercancel", 1));

    expect(clickOn(link).followed).toBe(true);
  });

  it("lapses a moment after the press lifts with no click", () => {
    vi.useFakeTimers();
    swallowClickOf({ pointerId: 1 });
    document.dispatchEvent(pointer("pointerup", 1));
    vi.advanceTimersByTime(400);

    expect(clickOn(link).followed).toBe(true);
  });

  it("waits for its own press, not another finger's", () => {
    vi.useFakeTimers();
    swallowClickOf({ pointerId: 1 });
    document.dispatchEvent(pointer("pointerup", 2));
    vi.advanceTimersByTime(400);

    expect(clickOn(link).followed).toBe(false);
  });
});
