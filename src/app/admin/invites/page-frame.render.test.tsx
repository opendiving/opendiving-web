import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InviteQueueFrame } from "@/components/admin/invite-queue-frame";
import { drawFrame, resetFrameMocks } from "@/test/page-frame";

// The invite queue's half of the page-frame check, which lives here rather than beside
// the other sixteen because nothing outside this directory may import the admin section
// (`lib/admin-isolation.test.ts`) - one import from a shared module is what would pull
// the whole section into every diver's bundle.
//
// `/admin` itself is a server redirect onto this screen, so this is the only frame the
// section draws.

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

vi.mock("@/components/ui/use-toast", async (importOriginal) => {
  const { frameMocks } = await import("@/test/page-frame");
  return {
    ...(await importOriginal<object>()),
    useToast: () => frameMocks.toast,
  };
});

vi.mock("@/lib/api/client", async (importOriginal) => {
  const { frameMocks } = await import("@/test/page-frame");
  return {
    ...(await importOriginal<object>()),
    apiClient: frameMocks.apiClient,
  };
});

beforeEach(resetFrameMocks);

describe("/admin/invites", () => {
  it("draws its own frame while the queue is in flight", async () => {
    const { container } = await drawFrame(
      "/admin/invites",
      () => import("./page"),
    );

    expect(container.querySelector("h1")).not.toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();

    const bars = container.querySelectorAll(".animate-skeleton");
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach((bar) => expect(bar).toHaveAttribute("aria-hidden", "true"));
    screen
      .queryAllByRole("row")
      .forEach((row) =>
        expect(row.querySelector(".animate-skeleton")).toBeNull(),
      );

    const animated = container.querySelectorAll(
      ".animate-skeleton, .animate-skeleton-reveal",
    );
    expect(animated.length).toBeGreaterThan(0);
    animated.forEach((node) =>
      expect(node.className).toContain("motion-reduce:animate-none"),
    );
  });

  // The queue's half of `app/list-card-headings.render.test.tsx`, here for the same
  // reason as the rest of this file. That file's coverage check names this frame, so
  // deleting this case is the one way to lose it quietly.
  it("keeps the card's heading in an empty queue's outline", () => {
    const { container } = render(
      <InviteQueueFrame isLoading={false} totalCount={0} />,
    );

    const headings = [...container.querySelectorAll("h1, h2, h3, h4, h5, h6")];
    expect(headings.map((heading) => Number(heading.tagName[1]))).toEqual([
      1, 2, 3,
    ]);
    expect(headings[1]).toHaveClass("sr-only");
  });
});
