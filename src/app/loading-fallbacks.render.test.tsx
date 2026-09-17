import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { clearRouteHold } from "@/lib/route-hold";
import {
  drawFrame,
  fallbackMocks as stable,
  resetFallbackMocks,
} from "@/test/route-fallback";

// What every `loading.tsx` owes: the frame it draws is the *destination's* own first
// render, element for element, so the Suspense swap replaces a screen with the same
// screen. Nothing else in the suite can see this - a fallback that drew the list's shape
// on the way into a dive would pass every other test in the repo and be the one thing a
// diver notices.
//
// The pages are rendered with their auth settled and every request left in flight, which
// is what a soft navigation into them looks like. One mock does the second half: the
// axios instance underneath `lib/api/` answers nothing, so every page and card sits in
// the state it arrives in.
//
// `/admin/invites` is the one destination checked elsewhere - in its own directory, since
// nothing outside the admin section may import it (`lib/admin-isolation.test.ts`).

vi.mock("next/navigation", async () => {
  const { fallbackMocks } = await import("@/test/route-fallback");
  return {
    usePathname: () => fallbackMocks.at.pathname,
    useRouter: () => fallbackMocks.router,
    useParams: () => fallbackMocks.params,
    useSearchParams: () => fallbackMocks.searchParams,
    useSelectedLayoutSegments: () => [],
    redirect: vi.fn(),
  };
});

vi.mock("@/contexts/AuthContext", async () => {
  const { fallbackMocks } = await import("@/test/route-fallback");
  return { useAuth: () => fallbackMocks.auth };
});

// Lives in `AppShell`, above the `<main>` both sides of every comparison are rendered
// into, so it is out of the shape being compared and in the way of rendering it.
vi.mock("@/components/layout/quick-create", async () => {
  const { fallbackMocks } = await import("@/test/route-fallback");
  return { useQuickCreate: () => fallbackMocks.openCreate };
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

// Every destination in the derived set, the segment whose `loading.tsx` covers it, and
// the page that answers for it. Adding a route to a covered segment means adding a row
// here; a route with no row is a destination nobody has said what to draw for.
const DESTINATIONS = [
  {
    path: "/dashboard",
    loading: () => import("./dashboard/loading"),
    page: () => import("./dashboard/page"),
  },
  {
    path: "/dives",
    loading: () => import("./dives/loading"),
    page: () => import("./dives/page"),
  },
  {
    path: "/dives/dive-1",
    loading: () => import("./dives/loading"),
    page: () => import("./dives/(detail)/layout"),
    params: { id: "dive-1" },
    // The `(detail)` layout owns the dive fetch and draws the skeleton; the page inside
    // it renders nothing until the dive is there.
    pageProps: { children: null },
  },
  {
    path: "/dives/dive-1/edit",
    loading: () => import("./dives/loading"),
    page: () => import("./dives/[id]/edit/page"),
    params: { id: "dive-1" },
  },
  {
    path: "/trips",
    loading: () => import("./trips/loading"),
    page: () => import("./trips/page"),
  },
  {
    path: "/trips/trip-1",
    loading: () => import("./trips/loading"),
    page: () => import("./trips/[id]/page"),
    params: { id: "trip-1" },
  },
  {
    path: "/sites",
    loading: () => import("./sites/loading"),
    page: () => import("./sites/page"),
  },
  {
    path: "/sites/site-1",
    loading: () => import("./sites/loading"),
    page: () => import("./sites/[id]/page"),
    params: { id: "site-1" },
  },
  {
    path: "/courses",
    loading: () => import("./courses/loading"),
    page: () => import("./courses/page"),
  },
  {
    path: "/courses/course-1",
    loading: () => import("./courses/loading"),
    page: () => import("./courses/[id]/page"),
    params: { id: "course-1" },
  },
  {
    path: "/species",
    loading: () => import("./species/loading"),
    page: () => import("./species/page"),
  },
  {
    path: "/species/species-1",
    loading: () => import("./species/loading"),
    page: () => import("./species/[id]/page"),
    params: { id: "species-1" },
  },
  {
    path: "/gear",
    loading: () => import("./gear/loading"),
    page: () => import("./gear/page"),
  },
  {
    path: "/gear/gear-1",
    loading: () => import("./gear/loading"),
    page: () => import("./gear/[id]/page"),
    params: { id: "gear-1" },
  },
  {
    path: "/certifications",
    loading: () => import("./certifications/loading"),
    page: () => import("./certifications/page"),
  },
];

const draw = drawFrame;

beforeEach(resetFallbackMocks);

afterEach(() => {
  clearRouteHold();
});

describe("every destination's fallback is the destination's own first render", () => {
  it.each(DESTINATIONS.map((d) => [d.path, d] as const))(
    "%s",
    async (path, destination) => {
      stable.params = destination.params ?? {};

      const fallback = await draw(path, destination.loading);
      stable.params = destination.params ?? {};
      const page = await draw(
        path,
        destination.page,
        destination.pageProps ?? {},
      );

      // Both empty would compare equal and mean nothing. Every one of these frames
      // draws placeholders and a heading, which is what makes the equality a claim.
      expect(fallback).toContain("animate-skeleton");
      expect(fallback).toMatch(/<h1/);
      expect(fallback).toBe(page);
    },
    30_000,
  );
});

describe("the skeleton contract holds for every fallback", () => {
  it.each(DESTINATIONS.map((d) => [d.path, d] as const))(
    "%s",
    async (path, destination) => {
      stable.params = destination.params ?? {};
      stable.at.pathname = path;
      const Fallback = (await destination.loading()).default;
      const { container } = render(<Fallback />);

      // A region that says it is busy, rather than a screen of boxes that say nothing.
      expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();

      // Every bar is out of the accessibility tree: a reader taken through a dozen
      // empty boxes is worse off than one told nothing at all.
      const bars = container.querySelectorAll(".animate-skeleton");
      expect(bars.length).toBeGreaterThan(0);
      bars.forEach((bar) => expect(bar).toHaveAttribute("aria-hidden", "true"));

      // And no placeholder row is announced as a row.
      const rows = screen.queryAllByRole("row");
      rows.forEach((row) =>
        expect(within(row).queryByTestId("skeleton")).toBeNull(),
      );
      rows.forEach((row) =>
        expect(row.querySelector(".animate-skeleton")).toBeNull(),
      );

      // Where the title is a placeholder it stands *inside* the heading, which is what
      // keeps the header the same height before and after the record lands.
      const heading = container.querySelector("h1");
      expect(heading).not.toBeNull();
      if (heading?.textContent === "") {
        expect(heading.querySelector(".animate-skeleton")).toBeInTheDocument();
      }
    },
    30_000,
  );
});

describe("reduced motion", () => {
  // Decision: a diver who has asked not to be animated at gets no hold either, and sees
  // the destination's frame - grey and all - at the click. That is accepted rather than
  // fixed, and asserted so it cannot change in silence. jsdom cannot evaluate the media
  // query, so what is pinned is the class that carries it.
  it.each(DESTINATIONS.map((d) => [d.path, d] as const))(
    "%s keeps motion-reduce on every placeholder",
    async (path, destination) => {
      stable.params = destination.params ?? {};
      stable.at.pathname = path;
      const Fallback = (await destination.loading()).default;
      const { container } = render(<Fallback />);

      const animated = container.querySelectorAll(
        ".animate-skeleton, .animate-skeleton-reveal",
      );
      expect(animated.length).toBeGreaterThan(0);
      animated.forEach((node) =>
        expect(node.className).toContain("motion-reduce:animate-none"),
      );
    },
    30_000,
  );
});

describe("/dives/new", () => {
  // The one destination with no pre-data render of its own: it draws its form as soon as
  // the auth check settles. Its fallback is the nearest existing shape, and what has to
  // match is the control the wait is escapable by.
  const backLink = (container: HTMLElement) => {
    const link = container.querySelector("a");
    return { href: link?.getAttribute("href"), label: link?.textContent };
  };

  it.each([
    ["nothing in the URL", new URLSearchParams(), "/dives", "Back to dives"],
    [
      "?from=/dashboard",
      new URLSearchParams("from=/dashboard"),
      "/dashboard",
      "Back to dashboard",
    ],
    [
      "?trip_uuid=",
      new URLSearchParams("trip_uuid=trip-1"),
      "/trips/trip-1",
      "Back to trip",
    ],
  ])("takes its back link from %s", async (_name, params, href, label) => {
    stable.searchParams = params;
    stable.at.pathname = "/dives/new";
    const Fallback = (await import("./dives/loading")).default;
    const fallback = render(<Fallback />);
    expect(backLink(fallback.container)).toEqual({ href, label });
    fallback.unmount();
    clearRouteHold();

    const Page = (await import("./dives/new/page")).default;
    const page = render(<Page />);
    expect(backLink(page.container)).toEqual({ href, label });
  });

  it("draws the dive form's eight fields rather than a spinner", async () => {
    stable.at.pathname = "/dives/new";
    const Fallback = (await import("./dives/loading")).default;
    const { container } = render(<Fallback />);

    // Eight labelled fields, two bars each, plus the header's title and subtitle, the
    // card heading and the two footer buttons.
    expect(container.querySelectorAll(".animate-skeleton")).toHaveLength(
      8 * 2 + 5,
    );
  });
});

describe("the edit form's back link survives the swap", () => {
  // A fallback with a constant link would swap "Back to dives" for "Back to trip" a round
  // trip later, on the one control the skeleton exists to keep honest.
  it.each([
    ["nothing in the URL", new URLSearchParams(), "/dives/dive-1"],
    ["?from=/dives", new URLSearchParams("from=/dives"), "/dives"],
    ["?trip_uuid=", new URLSearchParams("trip_uuid=trip-1"), "/trips/trip-1"],
  ])("%s", async (_name, params, href) => {
    stable.params = { id: "dive-1" };
    stable.searchParams = params;

    const fallback = await draw(
      "/dives/dive-1/edit",
      () => import("./dives/loading"),
    );
    stable.params = { id: "dive-1" };
    const page = await draw(
      "/dives/dive-1/edit",
      () => import("./dives/[id]/edit/page"),
    );

    expect(fallback).toContain(`href="${href}"`);
    expect(fallback).toBe(page);
  });
});
