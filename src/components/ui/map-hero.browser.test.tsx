import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { page } from "vitest/browser";
import { Plus } from "lucide-react";

import { Button } from "./button";
import { IndexHero } from "./map-hero";

// Load-bearing: the browser project renders no `app/layout.tsx`, so without this
// none of the Tailwind below computes and every box measures 0.
import "@/app/globals.css";

// `/certifications`' heading: the widest title and action an index page pairs.
function renderHero() {
  render(
    <IndexHero
      title="Certifications"
      description="Keep photos of your c-cards here"
      actions={
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New certification
        </Button>
      }
    />,
  );
  return {
    title: screen.getByRole("heading", { name: "Certifications" }),
    action: screen.getByRole("button", { name: "New certification" }),
  };
}

describe("an index page's heading", () => {
  it("puts its actions under the title on a 320px phone, not past the window", async () => {
    await page.viewport(320, 640);
    const { title, action } = renderHero();

    expect(action.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      title.getBoundingClientRect().bottom,
    );
    expect(action.getBoundingClientRect().right).toBeLessThanOrEqual(
      window.innerWidth,
    );
    expect(document.documentElement.scrollWidth).toBe(window.innerWidth);
  });

  it("keeps them on the title's line where both fit", async () => {
    await page.viewport(768, 640);
    const { title, action } = renderHero();
    const line = title.getBoundingClientRect();
    const box = action.getBoundingClientRect();

    expect(box.top).toBeLessThan(line.bottom);
    expect(box.bottom).toBeGreaterThan(line.top);
  });
});
