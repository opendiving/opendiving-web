import { describe, expect, it } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconTooltip } from "@/components/ui/tooltip";

// Focus only opens a hint when a keyboard is what moved it, so a test that
// wants the open has to say how the focus got there - `fireEvent.focus` alone
// does not say it, and the flag it reads is the page's rather than one
// render's.
const arriveByKeyboard = (element: HTMLElement) => {
  fireEvent.keyDown(document, { key: "Tab" });
  act(() => element.focus());
};

// The whole point of the component is that one string is both halves of the
// label: what a screen reader announces and what a sighted pointer user reads.
// A version that showed the chip but dropped the `aria-label` would look right
// in a browser and name nothing, so both are asserted from the same string.
describe("IconTooltip", () => {
  const renderOne = () =>
    render(
      <IconTooltip label="Delete dive #12">
        <Button variant="ghost" size="sm">
          <Trash2 className="h-4 w-4" />
        </Button>
      </IconTooltip>,
    );

  it("names the button it wraps", () => {
    renderOne();

    expect(
      screen.getByRole("button", { name: "Delete dive #12" }),
    ).toBeInTheDocument();
  });

  it("shows the same words on hover", async () => {
    renderOne();
    const button = screen.getByRole("button", { name: "Delete dive #12" });

    // Keyboard focus opens the same hint without waiting for the hover delay.
    arriveByKeyboard(button);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Delete dive #12");
  });

  it("does not also describe the button with what it is already called", async () => {
    renderOne();
    const button = screen.getByRole("button", { name: "Delete dive #12" });

    arriveByKeyboard(button);
    await screen.findByRole("tooltip");

    // Base UI's default wiring points `aria-describedby` at the open tooltip,
    // which for a hint that repeats the name verbatim makes a screen reader say
    // it twice. `IconTooltip` suppresses it; this is the assertion that notices
    // if a Base UI upgrade stops honouring the override.
    expect(button).not.toHaveAttribute("aria-describedby");
  });

  it("renders no wrapper element of its own", () => {
    const { container } = render(
      <div data-testid="row">
        <IconTooltip label="Clear">
          <button type="button">
            <Trash2 className="h-4 w-4" />
          </button>
        </IconTooltip>
      </div>,
    );

    // Several call sites absolutely position the button they wrap, or lay it out
    // as a flex child. An `IconTooltip` that emitted a `<span>` would move them.
    const row = container.querySelector('[data-testid="row"]');
    expect(row?.children).toHaveLength(1);
    expect(row?.firstElementChild?.tagName).toBe("BUTTON");
  });
});

// The dialog wrapper gives the first Escape to an open tooltip. The second
// Escape closes the dialog, including when the hint belongs to its close button.
describe("a hint inside a dialog", () => {
  it("takes the first Escape, and the dialog closes on the second", async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log a dive</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    const close = screen.getByRole("button", { name: "Close" });
    arriveByKeyboard(close);
    await screen.findByRole("tooltip");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});

// Drag handles focus themselves on pointer-down. IconTooltip suppresses that
// focus-opened hint so it does not cover the rows throughout a drag.
describe("a hint on a control that focuses itself on pointer-down", () => {
  const DragHandle = () => (
    <IconTooltip label="Reorder Blue Hole, position 1 of 3">
      <button
        type="button"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.focus();
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </IconTooltip>
  );

  it("stays shut through the press and after it", async () => {
    render(<DragHandle />);
    const handle = screen.getByRole("button", {
      name: "Reorder Blue Hole, position 1 of 3",
    });

    fireEvent.pointerDown(handle);
    expect(handle).toHaveFocus();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.pointerUp(document);
    fireEvent.pointerMove(handle);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("still opens when the same control is reached by keyboard", async () => {
    render(<DragHandle />);
    const handle = screen.getByRole("button", {
      name: "Reorder Blue Hole, position 1 of 3",
    });

    arriveByKeyboard(handle);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Reorder Blue Hole, position 1 of 3",
    );
  });
});

// A menu hands focus back to its trigger when it closes, and that focus is
// nobody's request for a hint: the pointer is wherever it dismissed the menu,
// which is not on the trigger.
describe("a hint on a menu trigger", () => {
  const Menu = () => (
    <DropdownMenu>
      <IconTooltip label="Account menu">
        <DropdownMenuTrigger render={<button type="button" />}>
          <Trash2 className="h-4 w-4" />
        </DropdownMenuTrigger>
      </IconTooltip>
      <DropdownMenuContent>
        <DropdownMenuItem>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  it("stays shut when the menu closes onto it", async () => {
    const user = userEvent.setup();
    render(<Menu />);
    const trigger = screen.getByRole("button", { name: "Account menu" });

    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
