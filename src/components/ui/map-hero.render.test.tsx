import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { IndexHero } from "./map-hero";
import { HINT_DELAY_MS } from "./tooltip";

describe("IndexHero", () => {
  // The dive list moves focus to its heading when something above the list
  // removes itself, and a heading takes focus only with a `tabindex`.
  it("makes the heading a focus target only when given a ref", () => {
    const headingRef = createRef<HTMLHeadingElement>();
    const { unmount } = render(
      <IndexHero
        title="Dives"
        subtitle="Your logbook"
        actions={<button>Log new dive</button>}
        headingRef={headingRef}
      />,
    );
    act(() => headingRef.current?.focus());
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    unmount();

    render(
      <IndexHero
        title="Trips"
        subtitle="Your trips"
        actions={<button>New trip</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveAttribute(
      "tabindex",
    );
  });

  // A page under a section's landing goes back to it; one reached from the
  // navigation has nowhere to go back to.
  it("draws the way back only when given one", () => {
    const { unmount } = render(
      <IndexHero title="Stats" backHref="/admin" backLabel="Back to admin" />,
    );
    expect(screen.getByRole("link", { name: "Back to admin" })).toHaveAttribute(
      "href",
      "/admin",
    );
    unmount();

    render(<IndexHero title="Admin" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("page information", () => {
  afterEach(() => vi.useRealTimers());
  const description = "Track your equipment and service history";
  const renderInfo = () => {
    render(<IndexHero title="Gear" description={description} />);
    return screen.getByRole("button", { name: "About this page" });
  };

  it("shows the full description on hover and dismisses it with Escape", async () => {
    const user = userEvent.setup();
    const button = renderInfo();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const previousFocus = document.activeElement;
    await user.hover(button);
    const popover = await screen.findByRole("dialog");
    expect(popover).toHaveTextContent(description);
    expect(document.activeElement).toBe(previousFocus);
    expect(popover).not.toHaveTextContent("About this page");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("opens on keyboard activation and returns focus after Escape", async () => {
    const user = userEvent.setup();
    renderInfo();
    await user.tab();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toHaveTextContent(description);
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "About this page" }),
      ).toHaveFocus(),
    );
  });

  it("waits before opening and cancels when the mouse only crosses the icon", async () => {
    vi.useFakeTimers();
    const button = renderInfo();
    const movePointer = (type: "pointerover" | "pointerout") =>
      fireEvent(
        button,
        Object.assign(new MouseEvent(type, { bubbles: true }), {
          pointerType: "mouse",
        }),
      );
    movePointer("pointerover");
    await act(() => vi.advanceTimersByTimeAsync(HINT_DELAY_MS - 1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    movePointer("pointerout");
    await act(() => vi.advanceTimersByTimeAsync(HINT_DELAY_MS));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    movePointer("pointerover");
    await act(() => vi.advanceTimersByTimeAsync(HINT_DELAY_MS));
    expect(screen.getByRole("dialog")).toHaveTextContent(description);
    movePointer("pointerout");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes once on mouse click after hovering without reopening", async () => {
    const user = userEvent.setup();
    const button = renderInfo();
    await user.hover(button);
    const popover = await screen.findByRole("dialog");
    await user.click(button);
    await waitFor(() => expect(popover).not.toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps a clicked popover open after the pointer leaves and dismisses outside", async () => {
    const user = userEvent.setup();
    const button = renderInfo();
    await user.click(button);
    const popover = await screen.findByRole("dialog");
    await waitFor(() => expect(popover).toHaveFocus());
    await user.unhover(button);
    expect(screen.getByRole("dialog")).toHaveTextContent(description);
    await user.click(document.body);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("still opens on a touch tap", async () => {
    const button = renderInfo();
    fireEvent.pointerEnter(button, { pointerType: "touch" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.click(button);
    const popover = await screen.findByRole("dialog");
    expect(popover).toHaveTextContent(description);
    await waitFor(() => expect(popover).toHaveFocus());
    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
