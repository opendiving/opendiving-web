import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./button";
import { ConfirmDialog } from "./confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Input } from "./input";
import { NativeSelect } from "./native-select";
import { pinToBottom, pinToTop, reveal, scrollPast } from "@/test/intersection";

// A press on the scrim must not be able to discard a half-filled form, which is
// what the dismissal tests cover. The opt-back-in case is the control: it proves
// the press below really reaches Radix's outside-interaction path, so the first
// test cannot pass by never having clicked anything.

// Radix registers its document `pointerdown` listener in a `setTimeout(0)` and
// runs the deferred outside event through another, so each dispatch needs a
// turn of the real event loop to land.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

// The scrim, which is the sibling Radix renders before the content and the only
// thing between a missed click and the page. It registers itself as a dismissal
// surface, so pressing it takes a different path through Radix than pressing
// anything else outside, and it is the path this guards.
//
// `fireEvent` rather than `userEvent`, because a modal dialog puts
// `pointer-events: none` on `body` and user-event refuses to click through it.
// Radix listens on the document, so the dispatch lands either way.
async function clickBackground() {
  const overlay = document.querySelector("[data-dialog-overlay]");
  expect(overlay).not.toBeNull();

  await userEvent.click(overlay!);
  await settle();
  await settle();
}

function open(props: Partial<React.ComponentProps<typeof DialogContent>> = {}) {
  const onOpenChange = vi.fn();
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent {...props}>
        <DialogTitle>Edit dive</DialogTitle>
        <Input aria-label="Notes" />
      </DialogContent>
    </Dialog>,
  );
  return { onOpenChange };
}

describe("DialogContent dismissal", () => {
  it("keeps the dialog and what is typed in it when the background is clicked", async () => {
    const { onOpenChange } = open();
    await settle();
    await userEvent.type(screen.getByLabelText("Notes"), "Thermocline at 18m");

    await clickBackground();

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Notes")).toHaveValue("Thermocline at 18m");
  });

  it("still closes for a dialog that opts back in", async () => {
    const { onOpenChange } = open({ onPointerDownOutside: () => {} });
    await settle();

    await clickBackground();

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("still closes on Escape", async () => {
    const { onOpenChange } = open();
    await settle();

    fireEvent.keyDown(screen.getByLabelText("Notes"), { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("DialogContent open focus", () => {
  // iOS opens a focused `<select>`'s picker wheel, so a dialog that starts
  // with one would open a dropdown nobody tapped.
  it("takes it on the panel when the first field is a picker", async () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log service</DialogTitle>
          </DialogHeader>
          <NativeSelect aria-label="Service type">
            <option value="service">Service</option>
          </NativeSelect>
        </DialogContent>
      </Dialog>,
    );
    await settle();

    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
  });

  it("gives any other first field Radix's default, stepping over the cross", async () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <Input aria-label="Name" defaultValue="Blue Hole" />
        </DialogContent>
      </Dialog>,
    );
    await settle();

    const name = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Name",
    });
    expect(name).toHaveFocus();
    // Radix selects what a text field holds as it focuses it, and so does this.
    expect(name.selectionStart).toBe(0);
    expect(name.selectionEnd).toBe("Blue Hole".length);
  });

  it("falls back to the panel when the cross is all there is", async () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Certification</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    await settle();

    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
  });
});

// Every dialog here is controlled and opened by a plain button, never by a
// `DialogTrigger`, so Radix has no trigger to hand focus back to on its own.
// Rendered in `StrictMode`, as `next dev` renders the app: its second run of
// the content's effects comes after an `autoFocus` field has taken focus.
describe("DialogContent focus return", () => {
  it("hands focus back to the button that opened it", async () => {
    function EditCourse() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Edit</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Edit course</DialogTitle>
              {/* The course dialog's own first field, which is what moves
                  focus before Radix gets a look at it. */}
              <Input aria-label="Name" autoFocus />
            </DialogContent>
          </Dialog>
        </>
      );
    }
    const user = userEvent.setup();
    render(
      <StrictMode>
        <EditCourse />
      </StrictMode>,
    );
    const edit = screen.getByRole("button", { name: "Edit" });

    edit.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(screen.getByLabelText("Name")).toHaveFocus();

    await user.keyboard("{Escape}");
    await settle();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(edit).toHaveFocus();
  });

  it("hands focus back to the menu button a confirmation was chosen from", async () => {
    function DeleteFromMenu() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>More actions</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setOpen(true)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Delete course"
            confirmText="Delete"
            onConfirm={() => {}}
          />
        </>
      );
    }
    const user = userEvent.setup();
    render(
      <StrictMode>
        <DeleteFromMenu />
      </StrictMode>,
    );
    const more = screen.getByRole("button", { name: "More actions" });

    more.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await settle();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await settle();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });
});

// Whether the footer is held at the foot of the dialog is the observer's answer,
// so `pinToBottom` stands in for the form running on below the dialog's edge and
// `reveal` for the footer resting at its end. The sticking itself, and its
// release on a short viewport, are CSS - `dialog.browser.test.tsx` measures them.
describe("DialogFooter", () => {
  function openWithFooter() {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Edit certification</DialogTitle>
          <form>
            <Input aria-label="Name" />
            <DialogFooter>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>,
    );
    return screen
      .getByRole("button", { name: "Save changes" })
      .closest("[data-dialog-footer]")!;
  }

  it("marks itself stuck only while pinned to the foot of the dialog", () => {
    const footer = openWithFooter();
    expect(footer).not.toHaveAttribute("data-stuck");

    act(() => pinToBottom());
    expect(footer).toHaveAttribute("data-stuck");

    act(() => reveal());
    expect(footer).not.toHaveAttribute("data-stuck");

    act(() => pinToBottom());
    act(() => scrollPast());
    expect(footer).not.toHaveAttribute("data-stuck");
  });
});

// The header's counterpart, with `pinToTop` for the content scrolled on under it
// and `reveal` for the header at rest at the top of a dialog scrolled there.
describe("DialogHeader", () => {
  function openWithHeader() {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit certification</DialogTitle>
          </DialogHeader>
          <Input aria-label="Name" />
        </DialogContent>
      </Dialog>,
    );
    return screen.getByRole("heading").closest("[data-dialog-header]")!;
  }

  it("marks itself stuck only while pinned to the top of the dialog", () => {
    const header = openWithHeader();
    expect(header).not.toHaveAttribute("data-stuck");

    act(() => pinToTop());
    expect(header).toHaveAttribute("data-stuck");

    act(() => reveal());
    expect(header).not.toHaveAttribute("data-stuck");

    // Below the root is not stuck at its top.
    act(() => pinToBottom());
    expect(header).not.toHaveAttribute("data-stuck");
  });

  it("carries the cross, which closes the dialog", async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit certification</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.closest("[data-dialog-header]")).not.toBeNull();

    await userEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// jsdom has no `visualViewport`, so each test hands it one with the height the
// keyboard would leave - 30rem, 480px at jsdom's 16px root, being the line.
describe("the short-viewport mark", () => {
  const original = window.visualViewport;
  afterEach(() => {
    Object.defineProperty(window, "visualViewport", {
      value: original,
      configurable: true,
    });
  });

  function withVisualViewport(height: number) {
    const viewport = Object.assign(new EventTarget(), {
      height,
      offsetTop: 0,
    });
    Object.defineProperty(window, "visualViewport", {
      value: viewport,
      configurable: true,
    });
    return viewport;
  }

  const root = document.documentElement;
  const SHORT = "data-visual-viewport-short";

  it("is on while the visible height is short, and follows it as it changes", async () => {
    const viewport = withVisualViewport(320);
    const { unmount } = render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Edit certification</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(root).toHaveAttribute(SHORT);

    // The keyboard closing: the footer waits for the box to finish growing
    // back before it pins again.
    viewport.height = 700;
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(root).toHaveAttribute(SHORT);
    await waitFor(() => expect(root).not.toHaveAttribute(SHORT));

    viewport.height = 479;
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(root).toHaveAttribute(SHORT);

    unmount();
    expect(root).not.toHaveAttribute(SHORT);
  });

  it("is off on a screen with room", () => {
    withVisualViewport(780);
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Edit certification</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(root).not.toHaveAttribute(SHORT);
  });
});
