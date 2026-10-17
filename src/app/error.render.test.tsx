import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RouteError from "./error";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the route error screen", () => {
  it("retries the segment when asked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    render(<RouteError error={new Error("boom")} retry={retry} />);

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it("offers a way home", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RouteError error={new Error("boom")} retry={() => {}} />);

    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  // Next shows the diver a generic message in production, so the console is where the
  // error itself is kept.
  it("logs the error it caught", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("boom");
    render(<RouteError error={error} retry={() => {}} />);

    expect(log).toHaveBeenCalledWith(error);
  });
});
