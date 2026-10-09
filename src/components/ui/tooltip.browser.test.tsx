import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Trash2 } from "lucide-react";

import { Button } from "./button";
import { IconTooltip } from "./tooltip";

const FINGER = { pointerType: "touch", pointerId: 7, clientX: 20, clientY: 20 };

describe("an icon button's name under a finger", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function renderOne() {
    const onClick = vi.fn();
    render(
      <IconTooltip label="Delete dive #12">
        <Button variant="ghost" size="sm" onClick={onClick}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </IconTooltip>,
    );
    return {
      button: screen.getByRole("button", { name: "Delete dive #12" }),
      onClick,
    };
  }

  const hint = () => screen.queryByRole("tooltip");
  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  it("shows on a hold, and the hold does not press the button", () => {
    const { button, onClick } = renderOne();

    fireEvent.pointerDown(button, FINGER);
    wait(500);
    expect(hint()).toHaveTextContent("Delete dive #12");

    fireEvent.pointerUp(button, FINGER);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("stays a moment after the finger lifts, then goes", () => {
    const { button } = renderOne();
    fireEvent.pointerDown(button, FINGER);
    wait(500);
    fireEvent.pointerUp(button, FINGER);

    wait(1000);
    expect(hint()).toBeInTheDocument();

    wait(600);
    expect(hint()).toBeNull();
  });

  it("goes a moment after a held finger turns into a scroll", () => {
    const { button } = renderOne();
    fireEvent.pointerDown(button, FINGER);
    wait(500);

    fireEvent.pointerCancel(button, FINGER);
    wait(1600);

    expect(hint()).toBeNull();
  });

  it("leaves a tap to press the button, with no name shown", () => {
    const { button, onClick } = renderOne();

    fireEvent.pointerDown(button, FINGER);
    wait(100);
    fireEvent.pointerUp(button, FINGER);
    fireEvent.click(button);
    wait(500);

    expect(onClick).toHaveBeenCalledOnce();
    expect(hint()).toBeNull();
  });

  it("takes a finger that moves for a drag, not a hold", () => {
    const { button } = renderOne();

    fireEvent.pointerDown(button, FINGER);
    fireEvent.pointerMove(button, { ...FINGER, clientY: 40 });
    wait(600);

    expect(hint()).toBeNull();
  });

  it("keeps the system's own menu off the hint", () => {
    const { button } = renderOne();
    fireEvent.pointerDown(button, FINGER);
    wait(500);

    expect(fireEvent.contextMenu(button)).toBe(false);
  });
});
