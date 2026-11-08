import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SitesPageFrame } from "./sites-page-frame";

// The frame around the finder: the page's heading and actions, and above the
// finder whatever the page has to say about the diver's sites.

describe("SitesPageFrame", () => {
  it("heads the page, offers a new site, and holds the notice above the finder", async () => {
    const onNew = vi.fn();
    render(
      <SitesPageFrame
        onNew={onNew}
        actions={<button type="button">Your proposals</button>}
        notice={<p>A notice</p>}
      >
        <div>The finder</div>
      </SitesPageFrame>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Dive Sites" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Your proposals" }),
    ).toBeInTheDocument();
    const notice = screen.getByText("A notice");
    const finder = screen.getByText("The finder");
    expect(
      notice.compareDocumentPosition(finder) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "New dive site" }),
    );
    expect(onNew).toHaveBeenCalledOnce();
  });
});
