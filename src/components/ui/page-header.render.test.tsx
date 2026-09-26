import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { IndexPageHeader } from "./page-header";

describe("IndexPageHeader", () => {
  // The dive list moves focus to its heading when something above the list
  // removes itself, and a heading takes focus only with a `tabindex`.
  it("makes the heading a focus target only when given a ref", () => {
    const headingRef = createRef<HTMLHeadingElement>();
    const { unmount } = render(
      <IndexPageHeader
        title="Dives"
        description="Your logbook"
        action={<button>Log new dive</button>}
        headingRef={headingRef}
      />,
    );
    act(() => headingRef.current?.focus());
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    unmount();

    render(
      <IndexPageHeader
        title="Trips"
        description="Your trips"
        action={<button>New trip</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveAttribute(
      "tabindex",
    );
  });
});
