import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NO_CHROME_ROUTES } from "@/components/layout/app-shell";
import {
  drawFrame,
  frameMocks as stable,
  resetFrameMocks,
} from "@/test/page-frame";

// What every destination owes: its *own* first render is the frame - the heading, the
// chrome and the placeholders - rather than a spinner or an empty column. Nothing else in
// the suite can see this. A page that early-returned a `Loader2` while its request was in
// flight would pass every other test in the repo and be the one thing a diver notices,
// because a click into it would go back to doing nothing until the data landed.
//
// The pages are rendered with their auth settled and every request left in flight, which
// is what a soft navigation into them looks like. One mock does the second half: the
// axios instance underneath `lib/api/` answers nothing, so every page and card sits in
// the state it arrives in.
//
// The set is derived from the route tree below rather than listed, so a new route inside
// the chrome fails here rather than being noticed months later. `/admin/invites` is the
// one destination checked elsewhere - in its own directory, since nothing outside the
// admin section may import it (`lib/admin-isolation.test.ts`).

vi.mock("next/navigation", async () => {
  const { frameMocks } = await import("@/test/page-frame");
  return {
    usePathname: () => frameMocks.at.pathname,
    useRouter: () => frameMocks.router,
    useParams: () => frameMocks.params,
    useSearchParams: () => frameMocks.searchParams,
    useSelectedLayoutSegments: () => [],
    redirect: vi.fn(),
  };
});

vi.mock("@/contexts/AuthContext", async () => {
  const { frameMocks } = await import("@/test/page-frame");
  return { useAuth: () => frameMocks.auth };
});

// Lives in `AppShell`, above the `<main>` every page here renders into, so it is out of
// the shape being inspected and in the way of rendering it.
vi.mock("@/components/layout/quick-create", async () => {
  const { frameMocks } = await import("@/test/page-frame");
  return { useQuickCreate: () => frameMocks.openCreate };
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

// Every destination, its route pattern - which is what the derivation below matches
// against - and the module that answers for it. A route with no row is a destination
// nobody has said what to draw for.
const DESTINATIONS = [
  {
    route: "/dashboard",
    path: "/dashboard",
    page: () => import("./dashboard/page"),
  },
  { route: "/dives", path: "/dives", page: () => import("./dives/page") },
  {
    route: "/dives/[id]",
    path: "/dives/dive-1",
    // The `(detail)` layout owns the dive fetch and draws the skeleton; the page inside
    // it renders nothing until the dive is there.
    page: () => import("./dives/(detail)/layout"),
    params: { id: "dive-1" },
    pageProps: { children: null },
  },
  {
    route: "/dives/[id]/edit",
    path: "/dives/dive-1/edit",
    page: () => import("./dives/[id]/edit/page"),
    params: { id: "dive-1" },
  },
  { route: "/trips", path: "/trips", page: () => import("./trips/page") },
  {
    route: "/trips/[id]",
    path: "/trips/trip-1",
    page: () => import("./trips/[id]/page"),
    params: { id: "trip-1" },
  },
  { route: "/sites", path: "/sites", page: () => import("./sites/page") },
  {
    route: "/sites/[id]",
    path: "/sites/site-1",
    page: () => import("./sites/[id]/page"),
    params: { id: "site-1" },
  },
  { route: "/courses", path: "/courses", page: () => import("./courses/page") },
  {
    route: "/courses/[id]",
    path: "/courses/course-1",
    page: () => import("./courses/[id]/page"),
    params: { id: "course-1" },
  },
  {
    route: "/contacts",
    path: "/contacts",
    page: () => import("./contacts/page"),
  },
  { route: "/species", path: "/species", page: () => import("./species/page") },
  {
    route: "/species/[id]",
    path: "/species/species-1",
    page: () => import("./species/[id]/page"),
    params: { id: "species-1" },
  },
  { route: "/gear", path: "/gear", page: () => import("./gear/page") },
  {
    route: "/gear/[id]",
    path: "/gear/gear-1",
    page: () => import("./gear/[id]/page"),
    params: { id: "gear-1" },
  },
  {
    route: "/certifications",
    path: "/certifications",
    page: () => import("./certifications/page"),
  },
  { route: "/checkin", path: "/checkin", page: () => import("./checkin/page") },
];

// ------------------------------------------------------------------ the derivation
const APP = __dirname;

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

const files = walk(APP);
const rel = (file: string) =>
  path.relative(APP, file).split(path.sep).join("/");

// A route path, with route groups dropped the way the router drops them.
const routeOf = (file: string) =>
  "/" +
  rel(file)
    .replace(/\/?page\.tsx$/, "")
    .split("/")
    .filter((segment) => segment && !segment.startsWith("("))
    .join("/");

// A Client Component, or a Server Component only so it can carry `instant = false` below an
// auth gate (see "A page under an auth-gate layout opts out of instant validation" in
// DECISIONS.md).
const isClientDrawn = (file: string) => {
  const source = readFileSync(file, "utf8");
  return (
    source.startsWith('"use client"') ||
    /^export const instant = false;$/m.test(source)
  );
};

// A destination is a page a signed-in diver navigates to inside the app chrome. The other
// server-rendered pages are the public ones and the `/admin` and `/settings` redirects; the
// chrome-free ones are reached from an email link or a redirect and draw their own layout.
const destinations = files
  .filter((file) => file.endsWith("/page.tsx"))
  .filter(isClientDrawn)
  .map(routeOf)
  .filter(
    (route) =>
      !NO_CHROME_ROUTES.some(
        (free) => route === free || route.startsWith(`${free}/`),
      ),
  );

// These destinations draw no frame, each for a reason of its own rather than by oversight:
// the `/settings` sections and `/data` render a spinner on their auth bootstrap and wait
// on no data of their own, so a frame there would draw grey where none is drawn, and
// `/dives/new` renders its real form as soon as that same bootstrap settles.
const NO_FRAME = ["/settings", "/data", "/dives/new"];

// The admin queue draws one, and it is checked inside `app/admin` because nothing out
// here may import that section (`lib/admin-isolation.test.ts`).
const framedInsideAdmin = (route: string) =>
  route === "/admin" || route.startsWith("/admin/");

beforeEach(resetFrameMocks);

describe("the destination set", () => {
  it("is covered, route for route", () => {
    const covered = new Set(
      DESTINATIONS.map((destination) => destination.route),
    );
    const owed = destinations
      .filter(
        (route) =>
          !NO_FRAME.some(
            (free) => route === free || route.startsWith(`${free}/`),
          ),
      )
      .filter((route) => !framedInsideAdmin(route));

    expect(owed.filter((route) => !covered.has(route))).toEqual([]);
    // A floor, so the derivation failing open is itself a failure.
    expect(owed.length).toBeGreaterThan(10);
  });

  it("has no loading boundary left anywhere under app", () => {
    // The frame is the page's own first render now, so a `loading.tsx` would be a second
    // renderer of it - and a Suspense fallback, which is what holds the page behind it
    // for ~300ms once it commits.
    expect(files.filter((file) => file.endsWith("/loading.tsx"))).toEqual([]);
  });
});

describe("every destination's first render is its own frame", () => {
  it.each(DESTINATIONS.map((d) => [d.path, d] as const))(
    "%s",
    async (route, destination) => {
      stable.params = destination.params ?? {};
      const { container } = await drawFrame(
        route,
        destination.page,
        destination.pageProps ?? {},
      );

      // A heading and placeholders, which is what makes this a frame rather than a
      // spinner or an empty column.
      expect(container.querySelector("h1")).not.toBeNull();
      expect(container.querySelector(".animate-spin")).toBeNull();

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
      if (heading?.textContent === "") {
        expect(heading.querySelector(".animate-skeleton")).toBeInTheDocument();
      }

      // A diver who has asked not to be animated at sees the frame - grey and all - at
      // the click, with no delay. That is accepted rather than fixed, and asserted so it
      // cannot change in silence. jsdom cannot evaluate the media query, so what is
      // pinned is the class that carries it.
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

// The two form pages take their back link from the URL, through `useReturnTo` - the one
// hook in the app that reads `useSearchParams()` with no Suspense boundary above it.
const backLink = (container: HTMLElement) => {
  const link = container.querySelector("a");
  return { href: link?.getAttribute("href"), label: link?.textContent };
};

describe("/dives/new", () => {
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
    const { container } = await drawFrame(
      "/dives/new",
      () => import("./dives/new/page"),
    );
    expect(backLink(container)).toEqual({ href, label });
  });

  it("draws its form rather than a spinner", async () => {
    // The one destination with no pre-data render of its own: it renders the real form as
    // soon as the auth check settles, which is why it is out of the frame set above.
    const { container } = await drawFrame(
      "/dives/new",
      () => import("./dives/new/page"),
    );

    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(container.querySelector("form")).not.toBeNull();
  });
});

describe("the edit form's back link", () => {
  it.each([
    ["nothing in the URL", new URLSearchParams(), "/dives/dive-1"],
    ["?from=/dives", new URLSearchParams("from=/dives"), "/dives"],
    ["?trip_uuid=", new URLSearchParams("trip_uuid=trip-1"), "/trips/trip-1"],
  ])("%s", async (_name, params, href) => {
    stable.params = { id: "dive-1" };
    stable.searchParams = params;

    const { container } = await drawFrame(
      "/dives/dive-1/edit",
      () => import("./dives/[id]/edit/page"),
    );

    expect(backLink(container).href).toBe(href);
  });
});
