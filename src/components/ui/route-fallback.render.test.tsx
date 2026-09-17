import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { RouteFallback } from "./route-fallback";
import { Skeleton } from "./skeleton";
import { ROUTE_FALLBACK_HOLD_MS, clearRouteHold } from "@/lib/route-hold";

// The hold is what makes a fallback and the page behind it read as one skeleton rather
// than two. These pin the lifetime it has, because getting that wrong is invisible in
// jsdom and shows up only as a blink on a slow link.

afterEach(() => {
  clearRouteHold();
  vi.restoreAllMocks();
});

const at = (ms: number) => vi.spyOn(performance, "now").mockReturnValue(ms);

const delayOf = (container: HTMLElement) =>
  container.querySelector("span")?.style.getPropertyValue("--skeleton-delay") ??
  "";

describe("RouteFallback", () => {
  it("hands its own placeholders the whole hold", () => {
    at(1000);
    const { container } = render(
      <RouteFallback>
        <Skeleton />
      </RouteFallback>,
    );

    expect(delayOf(container)).toBe(`${ROUTE_FALLBACK_HOLD_MS}ms`);
  });

  it("hands the page arriving behind it what is left of the same hold", () => {
    at(1000);
    const fallback = render(
      <RouteFallback>
        <Skeleton />
      </RouteFallback>,
    );

    // The page renders before the fallback's unmount effect runs, which is the order
    // React commits a Suspense swap in.
    at(1120);
    const page = render(<Skeleton />);
    expect(delayOf(page.container)).toBe(`${ROUTE_FALLBACK_HOLD_MS - 120}ms`);

    fallback.unmount();
  });

  it("leaves a placeholder that mounts after the navigation on the flat delay", () => {
    // A card refetching in place inside a page that has already arrived is not part of
    // anyone's navigation, and the 150ms delay in `tailwind.config.mts` is its own.
    at(1000);
    const fallback = render(
      <RouteFallback>
        <Skeleton />
      </RouteFallback>,
    );
    fallback.unmount();

    at(1200);
    const later = render(<Skeleton />);
    expect(later.container.querySelector("span")).not.toHaveAttribute("style");
  });

  it("draws no element of its own", () => {
    const { container } = render(
      <RouteFallback>
        <p>frame</p>
      </RouteFallback>,
    );

    expect(container.firstElementChild?.tagName).toBe("P");
  });
});
