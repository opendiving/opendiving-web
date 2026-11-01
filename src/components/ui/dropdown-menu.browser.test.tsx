import { describe, expect, it } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

const FINGER = { pointerType: "touch", pointerId: 7, button: 0 };

function renderMenu() {
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Edit</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  return screen.getByRole("button", { name: "Actions" });
}

const menu = () => screen.queryByRole("menu");

// What a finger's tap is: a press, a lift, and the click the browser sends.
function tap(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, FINGER);
  fireEvent.pointerUp(trigger, FINGER);
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.mouseUp(trigger, { button: 0 });
  fireEvent.click(trigger, { detail: 1 });
}

// Let the menu finish opening and install its outside-press listener.
const nextTick = () => act(() => new Promise((done) => setTimeout(done, 0)));

describe("a dropdown menu under a finger", () => {
  it("opens on a tap, not on the press that began it", async () => {
    const trigger = renderMenu();

    fireEvent.pointerDown(trigger, FINGER);
    expect(menu()).toBeNull();

    fireEvent.pointerUp(trigger, FINGER);
    fireEvent.mouseDown(trigger, { button: 0 });
    fireEvent.mouseUp(trigger, { button: 0 });
    fireEvent.click(trigger, { detail: 1 });
    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("opens nothing for a press the browser took for a scroll", () => {
    const trigger = renderMenu();

    fireEvent.pointerDown(trigger, FINGER);
    fireEvent.pointerCancel(trigger, FINGER);

    expect(menu()).toBeNull();
  });

  it("opens once from the keyboard after a finger scrolled from it", async () => {
    const trigger = renderMenu();
    fireEvent.pointerDown(trigger, FINGER);
    fireEvent.pointerCancel(trigger, FINGER);

    fireEvent.keyDown(trigger, { key: "Enter" });
    // The click a browser sends for Enter on a button.
    fireEvent.click(trigger, { detail: 0 });

    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("closes on a tap of its trigger, whose press reached only the page", async () => {
    const trigger = renderMenu();
    tap(trigger);
    await screen.findByRole("menu");
    await nextTick();

    // While the menu is open the page takes no pointer events, so the press
    // lands on the page and only the click reaches the trigger.
    fireEvent.pointerDown(document.body, FINGER);
    fireEvent.touchStart(document.body, {
      touches: [
        new Touch({
          identifier: 7,
          target: document.body,
          clientX: 0,
          clientY: 0,
        }),
      ],
    });
    fireEvent.pointerUp(document.body, FINGER);
    fireEvent.touchEnd(document.body, { touches: [] });
    fireEvent.mouseDown(document.body, { button: 0 });
    fireEvent.mouseUp(document.body, { button: 0 });
    fireEvent.click(trigger, { detail: 1 });
    await nextTick();

    await waitFor(() => expect(menu()).toBeNull());
  });

  it("still opens on a mouse's press", async () => {
    const trigger = renderMenu();

    fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
    fireEvent.mouseDown(trigger, { button: 0 });

    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });
});
