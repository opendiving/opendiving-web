import { createRef } from "react";
import { describe, expect, it } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { IndexHero } from "./map-hero";

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
});

describe("page information", () => {
  const description = "Track your equipment and service history";
  const renderInfo = () => {
    render(<IndexHero title="Gear" description={description} />);
    return screen.getByRole("button", { name: "About this page" });
  };

  it("shows the full description on hover and dismisses it with Escape", async () => {
    const user = userEvent.setup();
    const button = renderInfo();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.hover(button);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(description);
    expect(tooltip).not.toHaveTextContent("About this page");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
  });

  it("shows the description on keyboard focus", async () => {
    const user = userEvent.setup();
    renderInfo();
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(description);
  });

  it("still opens on a touch tap", async () => {
    const button = renderInfo();
    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.click(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(description);
  });
});
