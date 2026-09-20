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

  it("keeps nothing else: no count, and no actions with nothing to act on", () => {
    const { container } = render(
      <InviteQueueFrame isLoading={false} totalCount={0} />,
    );

    const heading = container.querySelector("h2")!;
    expect([...heading.parentElement!.children]).toEqual([heading]);
    expect(
      screen.queryByRole("button", { name: /Send invitations/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Remove/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing selected")).not.toBeInTheDocument();
  });

  // A queue still in flight is not an empty one: dropping the toolbar on the first
  // render and putting it back a moment later is the jump the frame exists to avoid.
  it("draws the count and the actions while the queue is loading", () => {
    render(<InviteQueueFrame isLoading={true} totalCount={0} />);

    expect(
      screen.getByRole("button", { name: /Send invitations/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing selected")).toBeInTheDocument();
  });

  it("draws them for a queue that holds something", () => {
    render(
      <InviteQueueFrame
        isLoading={false}
        totalCount={1}
        requests={[
          {
            email: "diver@example.com",
            created_at: "2026-09-01T10:00:00Z",
            has_account: false,
          },
        ]}
      />,
    );

    expect(screen.getByText("1 pending request")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Send invitations/ }),
    ).toBeInTheDocument();
  });
});
