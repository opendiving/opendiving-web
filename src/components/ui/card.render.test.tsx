import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardHeader, CardTitle } from "./card";

// `CardTitle`'s level is the whole of what `as` controls, and both halves of that
// are worth pinning: the tag has to move, and the look must not. A card title
// styled by its level would make the outline fix a visual change, and the sweep
// that put `as="h2"` on forty of these would have redrawn most of the app.

const renderTitle = (as?: "h2" | "h3" | "h4") =>
  render(
    <Card>
      <CardHeader>
        <CardTitle as={as}>Dive Log</CardTitle>
      </CardHeader>
    </Card>,
  );

describe("CardTitle", () => {
  it("is an h3 when nothing asks otherwise", () => {
    // The default suits a card nested under a section heading, which is what the
    // landing page's feature cards are.
    renderTitle();

    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Dive Log",
    );
  });

  it("becomes the level `as` names", () => {
    renderTitle("h2");

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Dive Log",
    );
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });

  it("looks identical at every level", () => {
    // The size comes from the classes, never from the tag - so promoting a title
    // for the outline's sake cannot be a design change.
    const { unmount } = renderTitle("h3");
    const asH3 = screen.getByRole("heading", { level: 3 }).className;
    unmount();

    renderTitle("h2");
    expect(screen.getByRole("heading", { level: 2 }).className).toBe(asH3);
  });

  it("keeps the caller's className alongside its own", () => {
    render(
      <CardTitle as="h2" className="flex items-center gap-2">
        Gear
      </CardTitle>,
    );

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveClass("flex", "text-2xl", "font-semibold");
  });
});
