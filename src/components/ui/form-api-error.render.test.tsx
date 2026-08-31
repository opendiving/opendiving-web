import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormApiError } from "./form-api-error";

// The message is the caller's; what only a render reaches is the wiring, and it is
// the whole reason this component exists rather than the
// `{apiError && <p className="text-sm text-destructive">}` its ten call sites wrote
// by hand. A live region that mounts *together with* its text is typically not
// announced at all - screen readers register the region on insertion and read only
// *subsequent* changes - so the conditional version put a refused save on screen and
// said nothing. The identity assertion below is the one that pins that down: the
// region the message arrives in must be the node that was already there.

describe("FormApiError", () => {
  it("mounts the live region before there is anything to say", () => {
    render(<FormApiError error={null} />);

    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("keeps the silent region out of sight and out of flow", () => {
    // `sr-only` is `position: absolute`, which is what lets the region be
    // permanent without adding a gap where the message would go. A visible-but-
    // empty <p> would change the spacing of every form using this.
    render(<FormApiError error={null} />);

    expect(screen.getByRole("alert")).toHaveClass("sr-only");
  });

  it("announces from the region that was already mounted", () => {
    const { rerender } = render(<FormApiError error={null} />);
    const region = screen.getByRole("alert");

    rerender(
      <FormApiError error="A dive site with this name already exists" />,
    );

    // Same node, not a replacement. A region torn down and rebuilt around its
    // text is exactly the silence this component exists to avoid.
    expect(screen.getByRole("alert")).toBe(region);
    expect(region).toHaveTextContent(
      "A dive site with this name already exists",
    );
  });

  it("takes on the visible styling once there is a message", () => {
    render(<FormApiError error="Nope" />);

    const region = screen.getByRole("alert");
    expect(region).toHaveClass("text-sm", "text-destructive");
    expect(region).not.toHaveClass("sr-only");
  });

  it("keeps a caller's spacing on the visible message", () => {
    // The settings cards space theirs off the block above; the dialogs don't.
    render(<FormApiError error="Nope" className="mt-3" />);

    expect(screen.getByRole("alert")).toHaveClass("mt-3");
  });
});
