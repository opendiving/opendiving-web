import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StandaloneShell } from "./standalone-shell";

// `AppShell` is the app's only other source of a `<main>`, and the six routes that
// opt out of it used to hand-roll this centered card instead - which left every one
// of them a document with no main landmark and no landmark around any of its
// content. That is what axe reported on `/signin` (`landmark-one-main` and
// `region`), and the element below is the whole reason this component exists rather
// than a seventh copy of the wrapper.

describe("StandaloneShell", () => {
  it("puts the page's content inside a main landmark", () => {
    render(
      <StandaloneShell>
        <p>Enter your email and we&apos;ll send you a sign-in link.</p>
      </StandaloneShell>,
    );

    expect(screen.getByRole("main")).toContainElement(
      screen.getByText(/send you a sign-in link/),
    );
  });

  it("leaves nothing outside it, the wordmark included", () => {
    // The wordmark is the only way back out of these screens, and it sat outside
    // every landmark on all six of them - six of `region`'s nodes on `/signin`.
    render(
      <StandaloneShell>
        <p>Body</p>
      </StandaloneShell>,
    );

    const main = screen.getByRole("main");
    expect(main).toContainElement(
      screen.getByRole("link", { name: "OpenDiving" }),
    );
    expect(document.body.textContent).toBe(main.textContent);
  });
});
