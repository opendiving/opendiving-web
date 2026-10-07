import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpeciesCatalogFrame } from "@/components/admin/species-catalog-frame";
import { drawFrame, resetFrameMocks } from "@/test/page-frame";

// The species catalog's half of the page-frame check, here for the reason the invite
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

describe("/admin/species", () => {
  it("draws its own frame while the catalog is in flight", async () => {
    const { container } = await drawFrame(
      "/admin/species",
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

  // The catalog's half of `app/list-card-headings.render.test.tsx`, here for the same
  // reason as the rest of this file. That file's coverage check names this frame.
  it("keeps the card's heading in an empty catalog's outline", () => {
    const { container } = render(
      <SpeciesCatalogFrame isLoading={false} totalCount={0} />,
    );

    const headings = [...container.querySelectorAll("h1, h2, h3, h4, h5, h6")];
    expect(headings.map((heading) => Number(heading.tagName[1]))).toEqual([
      1, 2, 3,
    ]);
    expect(headings[1]).toHaveClass("sr-only");
  });

  it("keeps nothing else: no count, no search and no chips", () => {
    const { container } = render(
      <SpeciesCatalogFrame isLoading={false} totalCount={0} />,
    );

    const heading = container.querySelector("h2")!;
    expect([...heading.parentElement!.children]).toEqual([heading]);
    expect(
      screen.queryByRole("button", { name: "Hidden" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the chips on a catalog narrowed to nothing", () => {
    render(
      <SpeciesCatalogFrame isLoading={false} totalCount={0} filter="hidden" />,
    );

    expect(screen.getByRole("button", { name: "Hidden" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("No species match.")).toBeInTheDocument();
  });
});
