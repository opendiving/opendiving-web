import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CountBadge } from "./count-badge";

// The badge's whole reason to exist is the `isLoading && count === 0` rule, and the
// obvious simplification of it - keying on `isLoading` alone - is wrong in a way that
// only shows up while paging. These pin both halves.

describe("CountBadge", () => {
  it("shows a placeholder instead of a count it doesn't have yet", () => {
    const { container } = render(
      <CountBadge count={0} isLoading label="total dive" />,
    );

    expect(container.querySelector(".animate-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/0 total dives/)).not.toBeInTheDocument();
  });

  it("keeps a total it already knows while the next page loads", () => {
    // Paging a loaded list sets `isLoading` again with `totalCount` intact. Blinking
    // the number away and back for each page turn is what keying on `isLoading`
    // alone would do.
    const { container } = render(
      <CountBadge count={42} isLoading label="total dive" />,
    );

    expect(screen.getByText("42 total dives")).toBeInTheDocument();
    expect(container.querySelector(".animate-skeleton")).toBeNull();
  });

  it("says zero out loud once zero is the answer", () => {
    render(<CountBadge count={0} isLoading={false} label="total dive" />);

    expect(screen.getByText("0 total dives")).toBeInTheDocument();
  });

  it("drops the plural for exactly one", () => {
    render(<CountBadge count={1} isLoading={false} label="certification" />);

    expect(screen.getByText("1 certification")).toBeInTheDocument();
  });
});
