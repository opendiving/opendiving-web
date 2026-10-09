import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Trash2 } from "lucide-react";

import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { IconTooltip, TextHint } from "./tooltip";

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

  it("gives way to a drag that follows the hold", () => {
    const { button } = renderOne();
    fireEvent.pointerDown(button, FINGER);
    wait(500);
    expect(hint()).toBeInTheDocument();

    fireEvent.pointerMove(button, { ...FINGER, clientY: 60 });

    expect(hint()).toBeNull();
  });

  it("goes after a lift that lands off the control", () => {
    // A drag handle's row moves under the finger, and the lift goes with it.
    const { button } = renderOne();
    fireEvent.pointerDown(button, FINGER);
    wait(500);

    fireEvent.pointerUp(document.body, FINGER);
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

  it("leaves a panel open elsewhere alone - a hold asks, it dismisses nothing", () => {
    const { button } = renderOne();
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Panel</PopoverTrigger>
        <PopoverContent>Open elsewhere</PopoverContent>
      </Popover>,
    );
    // Radix listens for a press outside an open panel from the next tick on.
    wait(0);

    fireEvent.pointerDown(button, { ...FINGER, button: 0 });
    wait(500);
    fireEvent.pointerUp(button, FINGER);
    fireEvent.click(button);
    wait(0);

    expect(screen.getByText("Open elsewhere")).toBeInTheDocument();
  });
});

describe("a label's hint under a finger", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const HINT = "Pescador Island, Panagsama Wall";
  const hint = () => screen.queryByRole("tooltip");
  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  function tap(target: Element, pointerType = "touch") {
    fireEvent.pointerDown(target, { ...FINGER, pointerType });
    fireEvent.pointerUp(target, { ...FINGER, pointerType });
    fireEvent.click(target);
  }

  it("says the whole of it on a tap", () => {
    render(
      <TextHint hint={HINT}>
        <span>Pescador Island +1</span>
      </TextHint>,
    );

    tap(screen.getByText("Pescador Island +1"));

    expect(hint()).toHaveTextContent(HINT);
  });

  it("stops saying it when a finger presses elsewhere", () => {
    render(
      <TextHint hint={HINT}>
        <span>Pescador Island +1</span>
      </TextHint>,
    );
    tap(screen.getByText("Pescador Island +1"));
    // Radix listens for a press outside an open hint from the next tick on.
    wait(0);

    fireEvent.pointerDown(document.body, FINGER);
    wait(0);

    expect(hint()).toBeNull();
  });

  it("leaves a mouse to the title, hovered or clicked", () => {
    render(
      <TextHint hint={HINT}>
        <span>Pescador Island +1</span>
      </TextHint>,
    );
    const label = screen.getByText("Pescador Island +1");

    fireEvent.pointerMove(label, { pointerType: "mouse" });
    wait(1000);
    tap(label, "mouse");

    expect(label).toHaveAttribute("title", HINT);
    expect(hint()).toBeNull();
  });

  it("leaves a tap in a link to the link", () => {
    render(
      <a href="#dive">
        <TextHint hint={HINT}>
          <span>Pescador Island +1</span>
        </TextHint>
      </a>,
    );

    tap(screen.getByText("Pescador Island +1"));

    expect(hint()).toBeNull();
  });

  it("is plain text when there is nothing more to say", () => {
    render(
      <TextHint hint={undefined}>
        <span>Pescador Island</span>
      </TextHint>,
    );
    const label = screen.getByText("Pescador Island");

    tap(label);

    expect(label).not.toHaveAttribute("title");
    expect(hint()).toBeNull();
  });
});
