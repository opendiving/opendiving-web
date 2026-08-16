import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateMenu } from "./create-menu";

// Four rules interact here and none of them is visible from the markup: hover
// opens, only a mouse counts, a click pins what hover opened, and focus is left
// alone unless the menu actually took it. Each was a bug before it was a rule,
// and each is a `pointerType` or a Radix seam away from silently regressing -
// see "The '+' menu opens on hover" in DECISIONS.md.

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const openCreate = vi.fn();
vi.mock("@/components/layout/quick-create", () => ({
  useQuickCreate: () => openCreate,
}));

const trigger = () => screen.getByRole("button", { name: "Create new" });
const isOpen = () => trigger().getAttribute("aria-expanded") === "true";

// Real timers, because the close is on a 150ms delay and user-event's own
// timing doesn't survive Vitest's fake ones. `pointerEventsCheck` off: the
// trigger is a Radix `DropdownMenuTrigger`, whose open menu leaves
// `pointer-events` on the page around it in a state user-event refuses to
// click through.
const user = () => userEvent.setup({ pointerEventsCheck: 0 });
const afterTheGracePeriod = () => new Promise((r) => setTimeout(r, 250));

beforeEach(() => {
  openCreate.mockClear();
  pathname = "/dashboard";
});

describe("CreateMenu", () => {
  it("opens when a mouse arrives on the + and lists every action", async () => {
    render(<CreateMenu />);

    await user().hover(trigger());

    await waitFor(() => expect(isOpen()).toBe(true));
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual([
      "New Dive",
      "New Trip",
      "New Dive Site",
      "New Gear",
      "New Certification",
    ]);
  });

  it("stays shut for a pointer that only crosses the +", async () => {
    // The "+" is on the way to the avatar and above the page's own actions, so
    // an opening menu has to mean the pointer settled, not that it passed by.
    render(<CreateMenu />);
    const session = user();

    await session.hover(trigger());
    await session.unhover(trigger());

    // Never opened on the way past, and no pending open lands afterwards
    // either - the second half is what a check of the end state alone would
    // miss, since the close delay would have tidied an early open away.
    expect(isOpen()).toBe(false);
    await afterTheGracePeriod();
    expect(isOpen()).toBe(false);
  });

  it("doesn't treat a touch pointer arriving as a hover", async () => {
    // Fired on its own, without the `pointerdown` a tap would put behind it,
    // because that is the half the guard owns: a tap opens the menu through
    // Radix's trigger either way (the case below), so a test that taps passes
    // whether or not `handlePointerEnter` filters on `pointerType`.
    render(<CreateMenu />);

    fireEvent.pointerEnter(trigger(), { pointerType: "touch" });

    expect(isOpen()).toBe(false);
  });

  it("opens on a tap and stays open, through the trigger rather than the hover", async () => {
    render(<CreateMenu />);

    await user().pointer({ target: trigger(), keys: "[TouchA]" });

    await waitFor(() => expect(isOpen()).toBe(true));
    // Lifting the finger ends the touch pointer, which fires `pointerleave`.
    // Nothing may be armed by it - a menu that closes itself a moment after a
    // tap opened it is the failure this guards.
    await afterTheGracePeriod();
    expect(isOpen()).toBe(true);
  });

  it("closes once the pointer has been away for the grace period", async () => {
    render(<CreateMenu />);
    const session = user();

    await session.hover(trigger());
    await waitFor(() => expect(isOpen()).toBe(true));
    await session.unhover(trigger());

    // The menu sits 4px below the trigger, so the close is deliberately not
    // immediate - it has to survive a pointer crossing that gap.
    expect(isOpen()).toBe(true);
    await waitFor(() => expect(isOpen()).toBe(false));
  });

  it("pins a hover-opened menu on click, and closes it on the next one", async () => {
    render(<CreateMenu />);
    const session = user();

    await session.hover(trigger());
    await waitFor(() => expect(isOpen()).toBe(true));
    await session.click(trigger());

    // Clicking "+" is habit; dismissing what the click was aimed at is not.
    expect(isOpen()).toBe(true);
    // And a pinned menu outlives the pointer that opened it.
    await session.unhover(trigger());
    await afterTheGracePeriod();
    expect(isOpen()).toBe(true);

    await session.click(trigger());
    await waitFor(() => expect(isOpen()).toBe(false));
  });

  it("hands the pinned menu the focus its keyboard handlers need", async () => {
    // Pinning works by preventing the press's default, which costs it the focus
    // it would otherwise have taken. Radix's arrows, typeahead and Enter all
    // live on the portaled content, so without this the pinned menu is visible
    // and keyboard-dead.
    render(<CreateMenu />);
    const session = user();

    await session.hover(trigger());
    await waitFor(() => expect(isOpen()).toBe(true));
    await session.click(trigger());

    expect(screen.getByRole("menu")).toContainElement(
      document.activeElement as HTMLElement,
    );
    // And having taken focus, it owes it back.
    await session.keyboard("{Escape}");
    await waitFor(() => expect(isOpen()).toBe(false));
    expect(trigger()).toHaveFocus();
  });

  it("doesn't let a right-click strand the menu open", async () => {
    // Radix's toggle ignores a secondary press. Taking the hover flag on one
    // anyway used to leave the menu with nothing to close it - the pointer
    // leaving no longer did, and only Escape or a click elsewhere would. (The
    // right-click may well dismiss it on the spot by moving focus off the
    // content; what matters is that it is never left stuck.)
    render(<CreateMenu />);
    const session = user();

    await session.hover(trigger());
    await waitFor(() => expect(isOpen()).toBe(true));
    await session.pointer({ target: trigger(), keys: "[MouseRight]" });
    await session.unhover(trigger());

    await waitFor(() => expect(isOpen()).toBe(false));
  });

  it("opens on a tap that follows a hover it already closed", async () => {
    // The hover flag used to survive the timed close, which left the pin
    // swallowing the next tap on a touchscreen laptop.
    render(<CreateMenu />);
    const session = user();

    await session.hover(trigger());
    await waitFor(() => expect(isOpen()).toBe(true));
    await session.unhover(trigger());
    await waitFor(() => expect(isOpen()).toBe(false));

    await session.pointer({ target: trigger(), keys: "[TouchA]" });

    await waitFor(() => expect(isOpen()).toBe(true));
  });

  it("leaves the caret where it was through a hover open, Escape and close", async () => {
    render(
      <>
        <input aria-label="Notes" />
        <CreateMenu />
      </>,
    );
    const session = user();
    const notes = screen.getByRole("textbox", { name: "Notes" });

    await session.click(notes);
    await session.hover(trigger());
    await waitFor(() => expect(isOpen()).toBe(true));
    expect(notes).toHaveFocus();

    // Escape dismisses from anywhere on the page, and used to hand focus to the
    // "+" - the one thing this menu's focus handling exists to prevent.
    await session.keyboard("{Escape}");

    await waitFor(() => expect(isOpen()).toBe(false));
    expect(notes).toHaveFocus();
  });

  it("returns the caret to the form even after the pointer crossed the menu", async () => {
    // Radix focuses whichever item the pointer settles on, so a peek can end up
    // holding focus without the diver ever asking for it. Handing that back to
    // the "+" - Radix's default - leaves the caret on a header button and the
    // form they were typing in abandoned.
    render(
      <>
        <input aria-label="Notes" />
        <CreateMenu />
      </>,
    );
    const session = user();
    const notes = screen.getByRole("textbox", { name: "Notes" });

    await session.click(notes);
    await session.hover(trigger());
    await waitFor(() => expect(isOpen()).toBe(true));
    await session.hover(screen.getByRole("menuitem", { name: "New Trip" }));
    expect(notes).not.toHaveFocus();

    await session.unhover(screen.getByRole("menuitem", { name: "New Trip" }));

    await waitFor(() => expect(isOpen()).toBe(false));
    expect(notes).toHaveFocus();
  });

  it("doesn't drag the caret back out of what picking an item opened", async () => {
    // The restore is for a menu the diver walked away from, not one they used.
    // Picking an item hands focus to whatever it opens - a quick-create dialog
    // traps it on its first field - and restoring on top of that put the caret
    // back in the page *behind* the modal, where every keystroke was swallowed
    // by a form the diver couldn't see.
    render(
      <>
        <input aria-label="Notes" />
        <CreateMenu />
      </>,
    );
    const session = user();
    const notes = screen.getByRole("textbox", { name: "Notes" });

    await session.click(notes);
    await session.hover(trigger());
    await waitFor(() => expect(isOpen()).toBe(true));
    await session.click(screen.getByRole("menuitem", { name: "New Trip" }));

    await waitFor(() => expect(isOpen()).toBe(false));
    expect(notes).not.toHaveFocus();
  });

  it("opens the dialog only once the menu is out of the way", async () => {
    // The two must not overlap. Opening from `onSelect` mounts the dialog into
    // the menu's teardown: the dialog focuses its first field, then Radix
    // refocuses the menu content because the overlay landing under the pointer
    // fires the item's `pointerleave`, and the menu unmounts still holding the
    // caret - leaving it on `<body>`, outside the dialog the diver just asked
    // for. Nothing about that is visible from the markup, so pin the ordering.
    const menuWhenOpened: (HTMLElement | null)[] = [];
    openCreate.mockImplementationOnce(() =>
      menuWhenOpened.push(screen.queryByRole("menu")),
    );
    render(<CreateMenu />);
    const session = user();

    await session.hover(trigger());
    await waitFor(() => expect(isOpen()).toBe(true));
    await session.click(screen.getByRole("menuitem", { name: "New Trip" }));

    await waitFor(() => expect(openCreate).toHaveBeenCalledWith("trip"));
    expect(menuWhenOpened).toEqual([null]);
  });

  it("gives focus back to the + when the menu had it", async () => {
    render(<CreateMenu />);
    const session = user();

    trigger().focus();
    await session.keyboard("{Enter}");
    await waitFor(() => expect(isOpen()).toBe(true));
    await waitFor(() => expect(trigger()).not.toHaveFocus());

    await session.keyboard("{Escape}");

    await waitFor(() => expect(isOpen()).toBe(false));
    expect(trigger()).toHaveFocus();
  });

  it("opens a dialog for an action that isn't a page of its own", async () => {
    render(<CreateMenu />);
    const session = user();

    await session.hover(trigger());
    await waitFor(() => expect(isOpen()).toBe(true));
    await session.click(screen.getByRole("menuitem", { name: "New Trip" }));

    expect(openCreate).toHaveBeenCalledWith("trip");
  });

  it("tells the dive form where it was launched from", async () => {
    render(<CreateMenu />);
    const session = user();

    await session.hover(trigger());
    await waitFor(() => expect(isOpen()).toBe(true));

    expect(screen.getByRole("menuitem", { name: "New Dive" })).toHaveAttribute(
      "href",
      "/dives/new?from=%2Fdashboard",
    );
  });

  it("sends nothing back when the page it was launched from is itself a form", async () => {
    // Otherwise Cancel on the new form would point at the form being cancelled.
    pathname = "/dives/new";
    render(<CreateMenu />);

    await user().hover(trigger());
    await waitFor(() => expect(isOpen()).toBe(true));

    expect(screen.getByRole("menuitem", { name: "New Dive" })).toHaveAttribute(
      "href",
      "/dives/new",
    );
  });
});
