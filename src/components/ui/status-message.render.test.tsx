import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusMessage } from "./status-message";

// The same wiring `FormApiError` pins: a live region that mounts together with its
// text is not announced, so the region has to be there before the message is, and
// the message has to arrive in that same node.

describe("StatusMessage", () => {
  it("mounts a silent, out-of-flow region before there is anything to say", () => {
    render(<StatusMessage variant="error">{null}</StatusMessage>);

    const region = screen.getByRole("alert");
    expect(region).toBeEmptyDOMElement();
    expect(region).toHaveClass("sr-only");
  });

  it("treats an empty string as nothing to say", () => {
    render(<StatusMessage variant="success">{""}</StatusMessage>);

    expect(screen.getByRole("alert")).toHaveClass("sr-only");
  });

  it("announces from the region that was already mounted", () => {
    const { rerender } = render(
      <StatusMessage variant="error" className="mb-2">
        {null}
      </StatusMessage>,
    );
    const region = screen.getByRole("alert");
    expect(region).not.toHaveClass("mb-2");

    rerender(
      <StatusMessage variant="error" className="mb-2">
        That link has expired
      </StatusMessage>,
    );

    expect(screen.getByRole("alert")).toBe(region);
    expect(region).toHaveTextContent("That link has expired");
    expect(region).not.toHaveClass("sr-only");
    expect(region).toHaveClass("border-destructive/40", "mb-2");
  });
});
