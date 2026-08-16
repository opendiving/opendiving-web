import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateMenu } from "./create-menu";

// Four rules interact here and none of them is visible from the markup: hover
// opens, only a mouse counts, a click pins what hover opened, and focus is left
// alone unless the menu actually took it. Each was a bug before it was a rule,
// and each is a `pointerType` or a Radix seam away from silently regressing -
// see "The '+' menu opens on hover" in DECISIONS.md.

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

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

  it("opens on a tap and stays open, because touch never arms the hover", async () => {
    // A tap fires `pointerenter` as well as `pointerdown`. If the hover path
    // took it, the tap would open the menu and its own click would toggle it
    // straight back shut - and the close timer would be armed besides.
    render(<CreateMenu />);

    await user().pointer({ target: trigger(), keys: "[TouchA]" });

    await waitFor(() => expect(isOpen()).toBe(true));
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
});
