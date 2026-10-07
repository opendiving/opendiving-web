import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";

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
