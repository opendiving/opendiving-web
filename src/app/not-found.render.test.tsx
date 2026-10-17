import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import NotFound from "./not-found";

describe("the not-found page", () => {
  it("says the page isn't there and points home", () => {
    render(<NotFound />);

    expect(screen.getByText("Page not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
