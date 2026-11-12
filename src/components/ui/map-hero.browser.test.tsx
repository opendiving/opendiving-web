import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { page } from "vitest/browser";
import { Fish, Plus } from "lucide-react";

import { Button } from "./button";
import { IndexHero, MapHero } from "./map-hero";

// A hero asks whether this instance draws map tiles; nothing here needs to know.
vi.mock("@/hooks/useInstanceConfig", () => ({
  useInstanceConfig: () => ({ config: null, isLoading: false }),
}));

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

describe("a map hero's details", () => {
  type Covered = { top: number; bottom: number; right: number; width: number };

  function renderMapHero(title: string) {
    let covered: Covered | undefined;
    render(
      <MapHero
        backHref="/species"
        backLabel="Back to marine life"
        icon={Fish}
        title={title}
        figures={[
          { label: "Dives", value: 1 },
          { label: "Last seen", value: "Nov 1, 2026" },
        ]}
        backdrop={(frame) => {
          covered = frame.covered;
          return null;
        }}
      />,
    );
    return () => covered!;
  }

  it("tell the backdrop where their text ends across the band, and how wide it is", async () => {
    await page.viewport(1440, 640);
    const covered = renderMapHero("Thalassoma rueppellii");
    const title = screen.getByRole("heading").firstElementChild!;
    const lastFigure = screen.getByText("Nov 1, 2026").parentElement!;

    await expect.poll(() => covered().width).toBe(1440);
    expect(covered().right).toBeCloseTo(
      Math.max(
        title.getBoundingClientRect().right,
        lastFigure.getBoundingClientRect().right,
      ),
    );
    // Short of the band's middle at this width, so most of its foot is open.
    expect(covered().right).toBeLessThan(720);
  });

  it("follow a longer title past the figures", async () => {
    await page.viewport(1440, 640);
    const covered = renderMapHero(
      "A species with a name long enough to outrun every figure",
    );
    const title = screen.getByRole("heading").firstElementChild!;

    await expect
      .poll(() => covered().right)
      .toBeCloseTo(title.getBoundingClientRect().right);
  });
});
