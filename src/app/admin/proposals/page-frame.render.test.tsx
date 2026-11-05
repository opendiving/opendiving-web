import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ProposalQueueFrame } from "@/components/admin/proposal-queue-frame";
import { drawFrame, resetFrameMocks } from "@/test/page-frame";

// The queue's half of the page-frame check, here for the reason the invite queue's
// is beside it: nothing outside this directory may import the admin section.

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

describe("/admin/proposals", () => {
  it("draws its own frame while the instance's config is in flight", async () => {
    const { container } = await drawFrame(
      "/admin/proposals",
      () => import("./page"),
    );

    expect(container.querySelector("h1")).not.toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();

    const animated = container.querySelectorAll(
      ".animate-skeleton, .animate-skeleton-reveal",
    );
    expect(animated.length).toBeGreaterThan(0);
    animated.forEach((node) =>
      expect(node.className).toContain("motion-reduce:animate-none"),
    );
  });

  // The queue's half of `app/list-card-headings.render.test.tsx`. That file's coverage
  // check names this frame.
  it("keeps the card's heading in an empty queue's outline", () => {
    const { container } = render(
      <ProposalQueueFrame isLoading={false} totalCount={0} />,
    );

    const headings = [...container.querySelectorAll("h1, h2, h3, h4, h5, h6")];
    expect(headings.map((heading) => Number(heading.tagName[1]))).toEqual([
      1, 2, 3,
    ]);
    expect(headings[1]).toHaveClass("sr-only");
  });
});
