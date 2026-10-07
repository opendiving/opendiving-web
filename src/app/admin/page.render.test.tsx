import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminPage from "./page";

describe("the admin section's landing", () => {
  it("offers every screen in the section", () => {
    render(<AdminPage />);

    expect(screen.getByRole("link", { name: /Invite Queue/ })).toHaveAttribute(
      "href",
      "/admin/invites",
    );
    expect(screen.getByRole("link", { name: /Stats/ })).toHaveAttribute(
      "href",
      "/admin/stats",
    );
    expect(screen.getByRole("link", { name: /Species/ })).toHaveAttribute(
      "href",
      "/admin/species",
    );
  });
});
