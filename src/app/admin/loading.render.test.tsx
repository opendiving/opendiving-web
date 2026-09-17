import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  drawFrame,
  fallbackMocks as stable,
  resetFallbackMocks,
} from "@/test/route-fallback";

// The invite queue's half of the loading-fallback parity check, which lives here rather
// than beside the other fifteen because nothing outside this directory may import the
// admin section (`lib/admin-isolation.test.ts`) - one import from a shared module is what
// would pull the whole section into every diver's bundle.
//
// `/admin` itself is a server redirect onto this screen, so the boundary above draws this
// frame for both paths under it.

vi.mock("next/navigation", async () => {
  const { fallbackMocks } = await import("@/test/route-fallback");
  return {
    usePathname: () => fallbackMocks.at.pathname,
    useRouter: () => fallbackMocks.router,
    useParams: () => fallbackMocks.params,
    useSearchParams: () => fallbackMocks.searchParams,
    redirect: vi.fn(),
  };
});

vi.mock("@/contexts/AuthContext", async () => {
  const { fallbackMocks } = await import("@/test/route-fallback");
  return { useAuth: () => fallbackMocks.auth };
});

vi.mock("@/components/ui/use-toast", async (importOriginal) => {
  const { fallbackMocks } = await import("@/test/route-fallback");
  return {
    ...(await importOriginal<object>()),
    useToast: () => fallbackMocks.toast,
  };
});

vi.mock("@/lib/api/client", async (importOriginal) => {
  const { fallbackMocks } = await import("@/test/route-fallback");
  return {
    ...(await importOriginal<object>()),
    apiClient: fallbackMocks.apiClient,
  };
});

beforeEach(resetFallbackMocks);

describe("/admin/invites", () => {
  it("draws the queue's own first render", async () => {
    const fallback = await drawFrame(
      "/admin/invites",
      () => import("./loading"),
    );
    const page = await drawFrame(
      "/admin/invites",
      () => import("./invites/page"),
    );

    expect(fallback).toContain("animate-skeleton");
    expect(fallback).toMatch(/<h1/);
    expect(fallback).toBe(page);
  });

  it("keeps the skeleton contract", async () => {
    stable.at.pathname = "/admin/invites";
    const Fallback = (await import("./loading")).default;
    const { container } = render(<Fallback />);

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    const bars = container.querySelectorAll(".animate-skeleton");
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach((bar) => expect(bar).toHaveAttribute("aria-hidden", "true"));
    screen
      .queryAllByRole("row")
      .forEach((row) =>
        expect(row.querySelector(".animate-skeleton")).toBeNull(),
      );
  });

  it("keeps motion-reduce on every placeholder", async () => {
    stable.at.pathname = "/admin/invites";
    const Fallback = (await import("./loading")).default;
    const { container } = render(<Fallback />);

    const animated = container.querySelectorAll(
      ".animate-skeleton, .animate-skeleton-reveal",
    );
    expect(animated.length).toBeGreaterThan(0);
    animated.forEach((node) =>
      expect(node.className).toContain("motion-reduce:animate-none"),
    );
  });
});
