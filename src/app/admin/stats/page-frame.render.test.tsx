import { beforeEach, describe, expect, it, vi } from "vitest";
import { drawFrame, resetFrameMocks } from "@/test/page-frame";

// The stats screen's half of the page-frame check, here for the reason the invite
// queue's is: nothing outside the admin section may import it
// (`lib/admin-isolation.test.ts`).

vi.mock("next/navigation", async () => {
  const { frameMocks } = await import("@/test/page-frame");
  return {
    usePathname: () => frameMocks.at.pathname,
    useRouter: () => frameMocks.router,
    useParams: () => frameMocks.params,
    useSearchParams: () => frameMocks.searchParams,
    redirect: vi.fn(),
  };
});

vi.mock("@/contexts/AuthContext", async () => {
  const { frameMocks } = await import("@/test/page-frame");
  return { useAuth: () => frameMocks.auth };
});

vi.mock("@/lib/api/client", async (importOriginal) => {
  const { frameMocks } = await import("@/test/page-frame");
  return {
    ...(await importOriginal<object>()),
    apiClient: frameMocks.apiClient,
  };
});

beforeEach(resetFrameMocks);

describe("/admin/stats", () => {
  it("draws its own frame while the month is in flight", async () => {
    const { container } = await drawFrame(
      "/admin/stats",
      () => import("./page"),
    );

    expect(container.querySelector("h1")).not.toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();

    const bars = container.querySelectorAll(".animate-skeleton");
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach((bar) => expect(bar).toHaveAttribute("aria-hidden", "true"));
    bars.forEach((bar) =>
      expect(bar.className).toContain("motion-reduce:animate-none"),
    );
  });

  it("keeps each card's heading while it waits", async () => {
    const { container } = await drawFrame(
      "/admin/stats",
      () => import("./page"),
    );

    expect(
      [...container.querySelectorAll("h2")].map((h2) => h2.textContent),
    ).toEqual(["Totals", "New accounts", "Activity"]);
  });
});
