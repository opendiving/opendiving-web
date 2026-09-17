// Times soft navigations - what happens between a click and the page being done -
// against a production build, and prints them as a markdown table.
//
//   npm run measure-navigations -- you@example.com              # every navigation
//   npm run measure-navigations -- you@example.com dives-gear   # just the named ones
//
//   LATENCIES=0,100,300 npm run measure-navigations -- you@example.com
//   RUNS=2 npm run measure-navigations -- you@example.com       # figures joined with `·`
//   REDUCED_MOTION=1 npm run measure-navigations -- you@example.com
//
// Chromium comes from CHROME_PATH, or from the usual Chrome install; playwright-core
// only drives it, so `npm install` never downloads a browser. Signing in works the same
// way `screenshots.mjs` does: request a magic link and read the token back out of the API
// container's log, so this only runs against a local stack whose logs you can read.
// `API_DIR` is where `docker compose logs` is run, and it defaults to the sibling
// `../opendiving-api`. That default is right in a checkout and wrong in a git worktree,
// which sits under `.claude/worktrees/` and so resolves `..` inside itself: name the
// checkout there rather than counting the levels back to it.
//
// ------------------------------------------------------------ the build it needs
//
// A *production* build, on its own port, beside whatever else is running. `next dev` does
// not prefetch at all, so a dev measurement is not a slower version of this one - it is a
// measurement of a different navigation.
//
//   NEXT_PUBLIC_API_URL= npm run build
//   API_INTERNAL_URL=http://localhost:8000 npx next start -p 3001
//   WEB_URL=http://localhost:3001 npm run measure-navigations -- you@example.com
//
// Both halves of the first line matter. `.env` bakes `NEXT_PUBLIC_API_URL` into the
// bundle at build time and the browser then talks to the API directly, but the API's CORS
// allowlist names `:3000` only - so every request from `:3001` preflights and fails.
// Emptying the variable puts the build on the same-origin route handler instead, which
// reads `API_INTERNAL_URL` per request. A worktree has no `.env` at all (it is gitignored,
// so it does not follow a `git worktree add`), and that is the right state here: do not
// copy one in, because the variable is baked and copying it would bake the split-origin
// URL back.
//
// Next 16 writes `next dev` output to `.next/dev/`, so this build does not corrupt a dev
// server's cache and a dev server does not corrupt this build. `next start` warns that it
// "does not work with output: standalone" and serves regardless; `node
// .next/standalone/server.js` is the faithful form if the warning matters.
//
// Sign-in works on the other port because this script builds the verify URL itself from
// `WEB_URL` and the token it read, so the link's own port is irrelevant; the token is
// validated by the API and the refresh cookie is set on `localhost`, which ignores ports.
//
// ------------------------------------------------------------ what the columns are
//
// All figures are milliseconds after the click. The clock is the page's own
// `performance.now()`, so every column is measured against the same origin.
//
//   RSC round trip ends   the navigation's own RSC request finishes (`responseEnd`)
//   Screen changes        the first DOM mutation under `<main>`
//   First visible grey    the first animation frame on which any skeleton element under
//                         `<main>` has a computed opacity above zero
//   First API call done   the first `/api/v1/` response that reached the server finishes
//   Settled               the last DOM mutation under `<main>`: the screen stopped moving
//   Prefetches            what the *source* page fetched before the click: requests
//                         carrying `next-router-prefetch` or `next-router-segment-prefetch`
//
// The two change columns are both here because they diverge, and the divergence is the
// point. A route fallback is inserted at the click and held at `opacity: 0`, so the DOM
// mutates immediately while nothing is *seen* for the length of the hold - a mutation
// timestamp is not a moment anything was visible, and a change that moved only the first
// column changed nothing a diver sees.
//
// What these numbers exist to check is the *order*, and it now differs by row. Where the
// destination is behind a loading boundary the screen changes at the click, before the
// round trip ends. Where it is not - a pager step, or a Back the router answers from its
// own cache - the round trip still comes first, which is the "nothing happens" phase the
// boundaries removed everywhere else. Each navigation below says which it is.
//
// Origin is a capture-phase `click` listener on `document`, so it is the click itself and
// not the navigation the click eventually causes. The one navigation with no click - Back
// - marks the same clock from the page immediately before `history.back()`.
//
// Latency comes from CDP `Network.emulateNetworkConditions` and is applied to the source
// page's load as well as the navigation, so the prefetch traffic pays it too.
//
// The first visit to a destination at a given latency also pays for its JS chunks, and the
// browser keeps them for the rest of the run. So `LATENCIES=0,100` is not the same
// measurement as `LATENCIES=100`: the 0 ms pass warms those chunks, and without it the
// boundary rows read about one round trip late. Compare two builds the same way round.
//
// `REDUCED_MOTION=1` runs the whole walk in a browser asking for reduced motion, where
// every skeleton carries `motion-reduce:animate-none` and so has no hold at all: the
// destination's frame paints at the click with its grey already visible. That is accepted
// behaviour rather than a defect, and the run asserts it so a later change cannot alter it
// in silence. The acceptance rules below invert for it.
//
// ------------------------------------------------------- timing the flagship's hop
//
// Not something this script does, and worth writing down so nobody rediscovers it. To
// time the real round trip against <https://opendiving.app>, replay a *real* navigation
// request. A bare `RSC: 1` request answers `307` to `/<route>?_rsc`, and so does a made-up
// `_rsc` value; the redirect target renders from the root because no state tree was sent,
// so its size is wrong even though its time to first byte is roughly right.
//
// The real request carries `RSC: 1`, `Next-Router-State-Tree` and `Next-Url`, with the
// `_rsc` query value the browser computed for that header set. Capture the set with
// `page.on("request")` against the local build - the tree is route structure, not build
// id, so it replays against the flagship unchanged - and replay it with one `curl` using
// `--next` between URLs, so every URL gets its own `-w` on a single warm connection. Print
// `status` and `bytes` in every `-w` and read `bytes=0` as a redirect rather than as a
// fast response.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = process.env.API_DIR ?? path.join(root, "..", "opendiving-api");
const WEB = process.env.WEB_URL ?? "http://localhost:3001";
// Same variable the app builds its axios `baseURL` from, so it carries the `/api/v1`
// prefix and the fetches below append only the route.
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

// Wide enough for the header's desktop nav, which is `hidden md:flex` - at a phone width
// the "Gear" link this measures is inside a menu that has to be opened first, which is a
// second click and a different measurement.
const VIEWPORT = { width: 1280, height: 900 };

// How long a page must go without a request finishing or a mutation under `<main>` before
// it counts as settled. Long enough to sit through a chart's second paint and a map's
// tiles; short enough that six navigations at two latencies is a coffee, not a lunch.
const QUIET_MS = 700;
const SETTLE_TIMEOUT_MS = 25_000;

// How far the list is scrolled before the Back navigation. Six pages at the list's
// ten-per-page default, which is the depth the prefetch count is worth reading at.
const BACK_ROWS = 60;

// A dive's page URL, which is also how a dive link is told from `/dives/new` and from the
// list itself.
const DIVE_PATH = /^\/dives\/[0-9a-f-]{36}$/;

// The links a diver can see and press, which is every one in the page's own content except
// the ones drawn inside a chart.
const PAGE_LINKS = "main a:not(svg *)";

const latencies = (process.env.LATENCIES ?? "0,100")
  .split(",")
  .map((value) => Number(value.trim()));
if (latencies.some((value) => !Number.isFinite(value) || value < 0)) {
  console.error(
    `LATENCIES must be whole milliseconds, not "${process.env.LATENCIES}"`,
  );
  process.exit(1);
}

const REDUCED_MOTION = process.env.REDUCED_MOTION === "1";

// The route fallback's hold, counted from the click - `src/lib/route-hold.ts`. Repeated
// here because the script is asked to fail a reveal that beats it, and a browser is the
// only thing that can read the app's own constant.
const ROUTE_FALLBACK_HOLD_MS = 330;

// Up to this latency a diver sees no grey at all, behind a boundary or without one - which
// is what the boundaries are calibrated not to change.
const NO_GREY_UP_TO_MS = 100;

// `tailwind.config.mts`'s flat fallback for `var(--skeleton-delay, 150ms)`, which governs
// wherever no route hold was opened: every in-place load, and - under the flags - a
// destination the router draws from a shell it already holds. Which of the two is in force
// is read off the placeholder rather than assumed, because it is not a property of the
// build.
const IN_PLACE_SKELETON_DELAY_MS = 150;

// How long after the click a fallback still counts as having painted *at* it. A frame
// drawn from what the browser is already holding lands in a frame or two; measured, the
// boundaries here mutate `<main>` within 40 ms of the click at every latency, most of
// them inside 20 - `/dives/new` is the slow one and pays about 25 ms more under the
// flags than without them. Generous enough for a busy machine, and an order of magnitude
// under the round trip it is there to beat.
const FRAME_BUDGET_MS = 60;

const RUNS = Number(process.env.RUNS ?? 1);
if (!Number.isInteger(RUNS) || RUNS < 1) {
  console.error(
    `RUNS must be a positive whole number, not "${process.env.RUNS}"`,
  );
  process.exit(1);
}

// ------------------------------------------------------------- the navigations
// Data, so that adding one is a row rather than a branch. Each entry says where the
// navigation starts and what to press; `arrive` is for the one that cannot be reached by
// opening a URL.
//
// The first three are the ones the timing story is told about. The fourth and fifth are
// where a per-route loading fallback paints a *different* frame from the one the source
// page drew. The sixth is the form page whose whole wait is its own RSC response, and so
// the one that decides how long the hold can be. The last is Back, which is the case a
// kept-mounted route would change and which no click can express.
//
// `boundary` says whether the destination is behind a loading boundary that is *new* for
// this navigation, which is what decides the order the row is held to.
const NAVIGATIONS = [
  {
    id: "dives-gear",
    label: "Dives → Gear",
    boundary: true,
    from: () => "/dives",
    target: (page) =>
      page.locator("header").getByRole("link", { name: "Gear", exact: true }),
  },
  {
    id: "dives-dive",
    label: "Dives → dive detail",
    boundary: true,
    from: () => "/dives",
    target: (page) => diveLink(page),
  },
  {
    id: "dive-pager",
    label: "Dive → neighbouring dive (pager)",
    // The `(detail)` slot is the same key for every dive, so nothing new mounts and the
    // dive on screen holds - which is the invariant the pager depends on.
    boundary: false,
    from: (subjects) => subjects.dive,
    target: (page) => pagerStep(page),
  },
  {
    id: "dashboard-dive",
    label: "Dashboard → dive detail",
    boundary: true,
    from: () => "/dashboard",
    target: (page) => diveLink(page),
  },
  {
    id: "dive-edit",
    label: "Dive detail → its edit page",
    boundary: true,
    from: (subjects) => subjects.dive,
    target: (page) =>
      page.locator("main").getByRole("link", { name: "Edit", exact: true }),
  },
  {
    id: "dives-new",
    label: "Dives → log a new dive",
    // The one destination with no data wait of its own: it draws its form as soon as the
    // auth check has settled, so its "data" is the RSC response and it is the shortest
    // window the hold has to clear. Measured for that reason rather than for its traffic.
    boundary: true,
    from: () => "/dives",
    target: (page) =>
      page.locator("main").getByRole("link", { name: "Log new dive" }),
  },
  {
    id: "dives-back",
    label: `Back to /dives from a dive (${BACK_ROWS} rows loaded)`,
    // The list is in the router's client cache, so nothing suspends and no fallback is
    // rendered - the boundary the forward navigation used is not new on the way back.
    boundary: false,
    back: true,
    // Not a URL: the whole point of this row is a list that has been scrolled, and a
    // history entry that remembers it. So it walks in, and resets the prefetch tally on
    // the way so the figure describes the dive page rather than the list.
    arrive: async (page, { traffic }) => {
      await open(page, "/dives");
      await loadRows(page, BACK_ROWS);
      await (await diveLink(page)).click();
      traffic.reset();
      await settle(page);
    },
  },
];

const email = process.argv[2] ?? process.env.SCREENSHOT_EMAIL;
if (!email) {
  console.error(
    "usage: npm run measure-navigations -- you@example.com [navigation...]",
  );
  process.exit(1);
}

const only = process.argv.slice(3);
const known = new Set(NAVIGATIONS.map((navigation) => navigation.id));
const unknown = only.filter((name) => !known.has(name));
if (unknown.length) {
  console.error(
    `unknown navigation(s): ${unknown.join(", ")} - pick from ${[...known].join(", ")}`,
  );
  process.exit(1);
}
const selected = NAVIGATIONS.filter(
  (navigation) => only.length === 0 || only.includes(navigation.id),
);

const chromePath = CHROME_CANDIDATES.find(
  (candidate) => candidate && existsSync(candidate),
);
if (!chromePath) {
  console.error(
    "No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.",
  );
  process.exit(1);
}

// ------------------------------------------------------------------- sign in
async function magicLink() {
  const response = await fetch(`${API}/auth/email/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok)
    throw new Error(`magic-link request failed: ${response.status}`);

  const logs = execFileSync(
    "docker",
    ["compose", "logs", "api", "--tail", "40"],
    {
      cwd: API_DIR,
    },
  ).toString();
  const token = [...logs.matchAll(/token=([A-Za-z0-9_.-]+)/g)].at(-1)?.[1];
  if (!token)
    throw new Error(`no magic-link token in the API log at ${API_DIR}`);
  return token;
}

// --------------------------------------------------------------- what to press
// The first dive on whatever page is open, by its own href rather than by its position in
// a table: the dives list draws two links per row and the dashboard draws its recent ones
// in a card, and a uuid-shaped path is the one thing both have in common - and the one
// thing that tells a dive apart from `/dives/new`.
//
// Anchors inside an `<svg>` are excluded, which is not tidiness: the dashboard's activity
// chart is hand-written SVG and links each bar to the dive it counts, so the first dive
// link on that page is a few pixels of chart rather than the row a diver clicks.
async function diveLink(page) {
  const href = await page.evaluate(
    ({ selector, pattern }) => {
      const matcher = new RegExp(pattern);
      return (
        [...document.querySelectorAll(`${selector}[href]`)]
          .map((node) => node.getAttribute("href"))
          .find((value) => matcher.test(value)) ?? null
      );
    },
    { selector: PAGE_LINKS, pattern: DIVE_PATH.source },
  );
  if (!href) throw new Error(`no dive link on ${new URL(page.url()).pathname}`);
  return page.locator(`${PAGE_LINKS}[href="${href}"]`).first();
}

// One step of the dive pager, in whichever direction the log has one. The ends of the log
// keep their button in place and dead, so "Previous" being there is not the same as it
// leading anywhere - `aria-disabled` is what says which.
async function pagerStep(page) {
  const pager = page.locator('nav[aria-label="Adjacent dives"]');
  for (const direction of ["Previous", "Next"]) {
    const step = pager.locator(`a[aria-label^="${direction} dive"]`);
    if ((await step.getAttribute("aria-disabled")) === "false") return step;
  }
  throw new Error(
    "this dive has no neighbour to step to - the log has one dive",
  );
}

// Presses "Load more" until the list holds `target` rows, or until the log runs out. A
// short log is not a failure: the run says how far it got and the figure it reports is
// about the list it actually measured.
async function loadRows(page, target) {
  const rows = () => page.locator("main table tbody tr").count();
  const button = page.getByRole("button", { name: /^Load more/ });
  for (let press = 0; (await rows()) < target; press++) {
    if (press > target || (await button.count()) === 0) break;
    await button.click();
    await settle(page);
  }
  return rows();
}

// -------------------------------------------------------------------- routes
// Which route a URL belongs to. `partialPrefetching` fetches one reusable App Shell per
// *route*, so a prefetch of one dive is what the router draws every other dive from, and
// asking whether some prefetch shares the navigation's *pathname* answers a question the
// build no longer decides anything by: it reads true for the first dive in a list and
// false for the second, at the same latency, off the same shell.
//
// Derived from the App Router tree rather than listed here, so a new route needs no edit -
// a directory holding a `page` file is a route, `(groups)` contribute no URL segment, and
// `_private`/`@slot` directories are not routes.
function appRoutes(dir, segments = []) {
  const routes = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /^page\.[jt]sx?$/.test(entry.name)) {
      routes.push(segments);
    }
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_") || entry.name.startsWith("@")) continue;
    const grouping = entry.name.startsWith("(") && entry.name.endsWith(")");
    routes.push(
      ...appRoutes(
        path.join(dir, entry.name),
        grouping ? segments : [...segments, entry.name],
      ),
    );
  }
  return routes;
}

const ROUTES = appRoutes(path.join(root, "src", "app"));

// The route pattern a pathname belongs to - `/dives/[id]/edit` - or the pathname itself
// where nothing matches, which leaves an unrecognised URL in a bucket of its own rather
// than silently joining another's. That fallback is also what a catch-all page would get:
// none exists, and matching one by segment count would be untested code for a route the
// tree does not have.
//
// Ties go to the fewest dynamic segments, which is Next's own specificity rule and is
// load-bearing here: `/dives/new` matches both `dives/new` and `dives/[id]`, and reading
// it as a dive would call it prefetched off any dive link on the page.
function routeOf(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const [best] = ROUTES.filter(
    (route) =>
      route.length === parts.length &&
      route.every(
        (segment, index) =>
          segment.startsWith("[") || segment === parts[index],
      ),
  ).sort(
    (a, b) =>
      a.filter((segment) => segment.startsWith("[")).length -
      b.filter((segment) => segment.startsWith("[")).length,
  );
  return best ? `/${best.join("/")}` : pathname;
}

// ------------------------------------------------------------------ measuring
// Everything Chrome fetched, classified by the request headers the router sets rather than
// by the shape of the URL - a prefetch and a navigation go to the same route and differ
// only here. Sizes are asked of Playwright once the request is finished, which is the one
// place the response headers' own bytes are counted alongside the body.
function watchTraffic(page) {
  let requests = [];
  const sizes = [];

  const onRequest = (request) => {
    const headers = request.headers();
    requests.push({
      prefetch: Boolean(
        headers["next-router-prefetch"] ??
        headers["next-router-segment-prefetch"],
      ),
      rsc: Boolean(headers["rsc"]),
      url: request.url(),
      request,
    });
  };
  const onFinished = (request) => {
    sizes.push(
      request
        .sizes()
        .then((size) => ({
          request,
          bytes: size.responseBodySize + size.responseHeadersSize,
        }))
        .catch(() => ({ request, bytes: 0 })),
    );
  };

  page.on("request", onRequest);
  page.on("requestfinished", onFinished);

  return {
    reset: () => {
      requests = [];
    },
    // Where the click falls in the sequence. Taken while the page is quiet, so there is
    // nothing in flight for the boundary to cut through.
    mark: () => requests.length,
    stop: () => {
      page.off("request", onRequest);
      page.off("requestfinished", onFinished);
    },
    // The source page's prefetches, and the URLs the router navigated to - the second is
    // how the destination's own round trip is picked out of the page's resource timings.
    read: async (mark) => {
      const measured = await Promise.all(sizes);
      const bytesOf = (request) =>
        measured.find((entry) => entry.request === request)?.bytes ?? 0;
      const before = requests.slice(0, mark);
      const prefetches = before.filter((entry) => entry.prefetch);
      const navigationUrls = new Set(
        requests
          .slice(mark)
          .filter((entry) => entry.rsc && !entry.prefetch)
          .map((entry) => entry.url),
      );
      // Whether the destination's route was among them is the variable that decides
      // whether a fallback can paint at all: a route the browser holds no shell for has
      // no client reference for its loading component, so the router has nothing to draw
      // until the response names one. Compared by route rather than by pathname - see
      // `routeOf` - because one shell serves every URL under a route.
      const navigationRoutes = new Set(
        [...navigationUrls].map((url) => routeOf(new URL(url).pathname)),
      );
      const destinationPrefetched = prefetches.some((entry) =>
        navigationRoutes.has(routeOf(new URL(entry.url).pathname)),
      );
      return {
        prefetchCount: prefetches.length,
        prefetchBytes: prefetches.reduce(
          (total, entry) => total + bytesOf(entry.request),
          0,
        ),
        destinationPrefetched,
        navigationUrls,
      };
    },
  };
}

// The page's own instruments, installed once the page is quiet and just before the click.
// `<main>` belongs to the root layout's `AppShell` and survives every navigation measured
// here, so one observer covers the click, the round trip and the destination's render.
const arm = (page) =>
  page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) throw new Error("this page draws no <main> to watch");

    const mark = {
      t0: null,
      firstDom: null,
      lastDom: null,
      firstGrey: null,
      lastGrey: null,
      greyBreak: null,
      // Whether a route fallback was ever in the document at all, at any opacity. Under
      // the flags a warm route can commit no fallback, and "no grey" then means the real
      // page arrived rather than that a hold hid one - two outcomes the grey column alone
      // cannot tell apart.
      fallbackRendered: false,
      // The `--skeleton-delay` the first placeholder actually mounted with, in
      // milliseconds, or null where the variable is unset and `tailwind.config.mts`'s
      // flat in-place default governs instead. Read rather than assumed: which of the
      // two delays is in force is the thing a reveal has to be judged against, and it is
      // not a constant of the build.
      skeletonDelay: null,
    };
    window.__navigationMark = mark;

    document.addEventListener(
      "click",
      () => {
        if (mark.t0 === null) mark.t0 = performance.now();
        sampleGrey();
      },
      true,
    );

    // Attributes are left out on purpose: the dive page flips `aria-busy` on the element
    // being navigated away from, which is a fact about the outgoing page rather than the
    // first thing a diver sees change.
    new MutationObserver(() => {
      if (mark.t0 === null) return;
      const now = performance.now();
      if (mark.firstDom === null) mark.firstDom = now;
      mark.lastDom = now;
    }).observe(main, { childList: true, subtree: true, characterData: true });

    // The *visible* half, which a MutationObserver cannot answer: a fallback is inserted
    // at the click and held at `opacity: 0`, so the frame it is seen on is a question
    // about computed style rather than about the tree. Sampled per animation frame,
    // because that is the granularity a diver has.
    //
    // The same loop answers continuity. The placeholder count is allowed to fall when the
    // data replaces the placeholders, and not otherwise: a hold that restarted on the
    // Suspense swap would blank bars that were already on screen while the same number of
    // them was still in the document, which is `greyBreak`.
    const SKELETONS = ".animate-skeleton, .animate-skeleton-reveal";
    let previous = null;
    let frames = 0;

    function sampleGrey() {
      if (mark.t0 === null) return;
      const present = main.querySelectorAll(SKELETONS);
      let visible = 0;
      for (const node of present) {
        if (Number(getComputedStyle(node).opacity) > 0) visible++;
      }
      const now = performance.now();
      if (present.length > 0) {
        mark.fallbackRendered = true;
        if (mark.skeletonDelay === null) {
          const declared = getComputedStyle(present[0])
            .getPropertyValue("--skeleton-delay")
            .trim();
          mark.skeletonDelay = declared ? Number.parseFloat(declared) : null;
        }
      }
      if (visible > 0) {
        if (mark.firstGrey === null) mark.firstGrey = now;
        mark.lastGrey = now;
      }
      if (
        previous &&
        mark.greyBreak === null &&
        visible < previous.visible &&
        present.length >= previous.present
      ) {
        mark.greyBreak = now;
      }
      previous = { visible, present: present.length };

      // Stops once the destination has nothing left to hold and the screen has had a
      // moment to prove it - `getComputedStyle` per frame over sixty bars is not free,
      // and the figures it perturbs are the ones being read.
      if (frames++ > 1200 || (previous.present === 0 && frames > 60)) return;
      requestAnimationFrame(sampleGrey);
    }
  });

// Waits for the page to stop doing things: no request finishing and no mutation under
// `<main>` for `QUIET_MS`. `networkidle` alone answers the first half only, and the second
// is where a chart's second paint and a list's appended rows live.
async function settle(
  page,
  { quiet = QUIET_MS, timeout = SETTLE_TIMEOUT_MS } = {},
) {
  const deadline = Date.now() + timeout;
  let previous = null;
  while (Date.now() < deadline) {
    const now = await page.evaluate(() => ({
      resources: performance.getEntriesByType("resource").length,
      dom: window.__navigationMark?.lastDom ?? null,
    }));
    if (
      previous &&
      previous.resources === now.resources &&
      previous.dom === now.dom
    ) {
      return;
    }
    previous = now;
    await page.waitForTimeout(quiet);
  }
  console.log(
    `  · gave up waiting for ${page.url()} to settle after ${timeout} ms`,
  );
}

// A full load, which is also what clears the router's client cache between measurements -
// every navigation here is measured as a first click, not as a second one.
async function open(page, url) {
  await page.goto(`${WEB}${url}`);
  if (new URL(page.url()).pathname === "/signin") {
    throw new Error(`signed out on the way to ${url}`);
  }
  await settle(page);
}

// One navigation, one latency, one run. The resource timings are read out of the page at
// the end rather than followed as they arrive, so every figure comes off one clock.
async function measure(page, navigation, subjects) {
  const traffic = watchTraffic(page);
  try {
    if (navigation.arrive) await navigation.arrive(page, { traffic });
    else await open(page, navigation.from(subjects));

    await arm(page);
    const mark = traffic.mark();

    if (navigation.back) {
      // The one origin that is not a click. Marked from inside the page so it shares the
      // clock with everything else rather than being a wall-clock guess from out here.
      await page.evaluate(() => {
        window.__navigationMark.t0 = performance.now();
        history.back();
      });
    } else {
      await (await navigation.target(page)).click();
    }

    await settle(page);
    const {
      prefetchCount,
      prefetchBytes,
      destinationPrefetched,
      navigationUrls,
    } = await traffic.read(mark);

    const timings = await page.evaluate(
      (urls) => {
        const mark = window.__navigationMark;
        // Requests the click *caused*, so the filter is on when each one started rather
        // than on when it finished. A request the outgoing page had in flight can land
        // well after the click, and counted as the destination's first it reads as a page
        // whose data arrived before its own round trip did.
        const after = performance
          .getEntriesByType("resource")
          .filter((entry) => entry.startTime >= mark.t0);
        const first = (predicate) => {
          const ends = after
            .filter(predicate)
            .map((entry) => entry.responseEnd);
          return ends.length ? Math.min(...ends) : null;
        };
        return {
          t0: mark.t0,
          rsc: first((entry) => urls.includes(entry.name)),
          dom: mark.firstDom,
          // A *call*, so anything the browser answered out of its own cache is not one:
          // `transferSize` is zero for those and non-zero for anything that reached the
          // server, headers included. The navigation commits before the outgoing page
          // unmounts, and its re-render re-requests the images it is already holding -
          // which answer in no measurable time and would otherwise be reported as the
          // destination's data arriving a whole round trip before it did.
          api: first(
            (entry) =>
              entry.transferSize > 0 &&
              new URL(entry.name).pathname.includes("/api/v1/"),
          ),
          // The *screen* settling, not the network: the destination page goes on
          // prefetching its own links long after the diver is reading it, and the dive
          // page's map keeps pulling tiles into a WebGL canvas that mutates no DOM at all.
          // Both would be counted by a last-response rule, and neither is a page that is
          // still becoming itself.
          last: mark.lastDom,
          grey: mark.firstGrey,
          greyBreak: mark.greyBreak,
          fallbackRendered: mark.fallbackRendered,
          skeletonDelay: mark.skeletonDelay,
        };
      },
      [...navigationUrls],
    );

    const since = (value) =>
      value === null ? null : Math.round(value - timings.t0);
    return {
      rsc: since(timings.rsc),
      dom: since(timings.dom),
      grey: since(timings.grey),
      greyBreak: since(timings.greyBreak),
      api: since(timings.api),
      settled: since(timings.last),
      prefetchCount,
      prefetchBytes,
      destinationPrefetched,
      fallbackRendered: timings.fallbackRendered,
      skeletonDelay: timings.skeletonDelay,
    };
  } finally {
    traffic.stop();
  }
}

// ---------------------------------------------------------------- the report
const cell = (runs, key) =>
  runs.map((run) => (run[key] === null ? "—" : run[key])).join(" · ");

const kb = (bytes) =>
  bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.round(bytes / 1000)} kB`;

function table(rows) {
  const header = [
    "| Navigation | Added latency | RSC round trip ends | Screen changes | First visible grey | First API call done | Settled | Prefetches before the click |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const body = rows.map(
    ({ label, latency, runs }) =>
      `| ${label} | ${latency === 0 ? "0" : `+${latency}`} | ${cell(runs, "rsc")} | ` +
      `${cell(runs, "dom")} | ${cell(runs, "grey")} | ${cell(runs, "api")} | ${cell(runs, "settled")} | ` +
      `${cell(runs, "prefetchCount")} req, ${runs.map((run) => kb(run.prefetchBytes)).join(" · ")} |`,
  );
  return [...header, ...body].join("\n");
}

// The acceptance test, asked of the figures rather than of a reader.
//
// **Where the destination is behind a new loading boundary and the source page prefetched
// it, its frame paints at the click** - within `FRAME_BUDGET_MS`, which is what "from
// what the browser already has" means in milliseconds. That is the inversion these
// boundaries exist to make, and it is stated as a budget rather than as "before the round
// trip ends" so it says the same thing at every latency: on localhost with no emulation
// the round trip is five milliseconds, which no paint can beat and which proves nothing.
//
// **Where the destination was *not* prefetched, nothing can paint**, and that is a note
// rather than a failure. `<Link>` prefetches what is in the viewport, so a link below the
// fold - the dashboard's Recent Dives card at this window size - is first asked for at
// the click, and until the response names a loading component the router has none to
// draw. Scrolling to the card first, which is what a diver does before pressing it, puts
// the row back on the budget. `partialPrefetching` does not lift this: it changes what a
// prefetch contains, not when one happens, and an offscreen `<Link>` still makes none.
//
// **Where there is no new boundary** - a pager step, a Back the router answers from its
// own cache - the old direction stands and is checked as such, so a boundary appearing
// where none belongs fails the run rather than passing it quietly.
//
// **And the hold is checked in pixels.** No row may show grey before the delay its
// placeholders actually mounted with has elapsed, at any latency; and up to
// `NO_GREY_UP_TO_MS`, whose own comment says why, no row may show grey at all - which is
// the property this app has without any of these boundaries, and the one the calibration
// is there to keep. A run against a build of `main` is how that premise is confirmed
// rather than assumed: the column is measured from computed style and needs nothing from
// this branch to report.
//
// The delay is read off the placeholder rather than taken from `ROUTE_FALLBACK_HOLD_MS`,
// because the two disagree. A route hold is opened by the fallback's own render, and a
// destination the router draws from a shell it already holds does not open one: the
// placeholders mount with the variable unset and the in-place default governs. The run
// notes every row where that happened, so a reveal moving from 330 ms to 150 ms is
// visible as a change in mechanism rather than absorbed as a passing number.
//
// A row with no round trip is a note and not a failure - Back can be answered entirely
// from the router's client cache, and a navigation that needs no server is the outcome
// this whole exercise is aiming at rather than a broken measurement. A row where the
// screen never changed is a failure, because that is the instrument and not the app.
//
// Under `REDUCED_MOTION=1` the grey rules invert: `motion-reduce:animate-none` drops the
// hold along with the animation, so a boundary's frame is seen at the click, grey and
// all. That is accepted behaviour, and asserting it is what keeps a later change from
// altering it in silence.
//
// It is asserted only of a navigation that actually committed a fallback. Under the flags
// a warm route can render itself without one - `/dives/new` does - and then there is no
// hold to see through and no grey to expect; the run says so and moves on. Without that
// distinction the assertion reads a route that got faster as a route that broke.
function checkAcceptance(rows) {
  const failures = [];
  const notes = [];
  for (const { label, latency, boundary, runs } of rows) {
    runs.forEach((run, index) => {
      const at = `${label} at +${latency} ms${runs.length > 1 ? ` (run ${index + 1})` : ""}`;

      if (run.dom === null) {
        failures.push(`${at}: nothing changed under <main>`);
        return;
      }

      if (run.rsc === null) {
        notes.push(`${at}: no RSC round trip - answered from the client cache`);
      }

      if (boundary && !run.destinationPrefetched) {
        notes.push(
          `${at}: the destination was not prefetched before the click, so the router had no fallback to draw - the screen changed at ${run.dom} ms`,
        );
        if (run.rsc !== null && run.rsc > run.dom) {
          failures.push(
            `${at}: the screen changed at ${run.dom} ms without a prefetched fallback, before the round trip ended at ${run.rsc} ms`,
          );
        }
      } else if (boundary && run.dom > FRAME_BUDGET_MS) {
        failures.push(
          `${at}: the screen changed at ${run.dom} ms, past the ${FRAME_BUDGET_MS} ms budget - the prefetched boundary drew nothing at the click`,
        );
      } else if (!boundary && run.rsc !== null && run.rsc > run.dom) {
        failures.push(
          `${at}: the screen changed at ${run.dom} ms, before the round trip ended at ${run.rsc} ms - this navigation is behind no new boundary`,
        );
      }

      if (run.greyBreak !== null) {
        failures.push(
          `${at}: placeholders that were visible went blank at ${run.greyBreak} ms with the same number still on the page - the hold restarted`,
        );
      }

      if (REDUCED_MOTION) {
        if (!boundary || !run.destinationPrefetched) return;
        if (!run.fallbackRendered) {
          notes.push(
            `${at}: no fallback committed, so there is no hold to see through - the destination rendered itself`,
          );
        } else if (run.grey === null) {
          failures.push(
            `${at}: reduced motion showed no grey at all - the frame is expected to paint with its placeholders visible`,
          );
        } else if (run.grey > FRAME_BUDGET_MS) {
          failures.push(
            `${at}: reduced motion showed grey at ${run.grey} ms, past the ${FRAME_BUDGET_MS} ms budget - it is expected at the click`,
          );
        }
        return;
      }

      // The delay actually in force, not the one this navigation was designed around.
      // A route hold is opened by the fallback's own render, and a destination the router
      // draws from a shell it already holds never opens one - so the reveal is judged
      // against the in-place default there, and the run says which applied.
      const hold = run.skeletonDelay ?? IN_PLACE_SKELETON_DELAY_MS;
      if (boundary && run.fallbackRendered && run.skeletonDelay === null) {
        notes.push(
          `${at}: no route hold was opened, so the reveal is the in-place ${IN_PLACE_SKELETON_DELAY_MS} ms rather than ${ROUTE_FALLBACK_HOLD_MS} ms`,
        );
      }

      if (run.grey !== null && run.grey < hold) {
        failures.push(
          `${at}: grey at ${run.grey} ms, inside the ${hold} ms delay it mounted with`,
        );
      } else if (run.grey !== null && latency <= NO_GREY_UP_TO_MS) {
        failures.push(
          `${at}: grey at ${run.grey} ms, where this navigation shows none today`,
        );
      }
    });
  }
  return { failures, notes };
}

// ------------------------------------------------------------------- the run
const link = await magicLink();

const browser = await chromium.launch({ executablePath: chromePath });
const context = await browser.newContext({
  viewport: VIEWPORT,
  ...(REDUCED_MOTION ? { reducedMotion: "reduce" } : {}),
});
context.setDefaultTimeout(60_000);
// The default buffer is 250 entries, and `/dives` alone makes more than that between its
// prefetches and its rows - silently, by dropping the ones that would have been read here.
await context.addInitScript(() =>
  performance.setResourceTimingBufferSize(5000),
);

const page = await context.newPage();
const cdp = await context.newCDPSession(page);

await page.goto(`${WEB}/auth/verify?token=${link}`);
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("button", { name: "Account menu" }).waitFor();

// Two of the navigations start on a dive rather than on a list, and which dive is a fact
// about the account rather than something to write down here.
await open(page, "/dives");
const subjects = { dive: await (await diveLink(page)).getAttribute("href") };
console.log(`dive ${subjects.dive}\n`);

const rows = [];
for (const latency of latencies) {
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  for (const navigation of selected) {
    const runs = [];
    for (let run = 0; run < RUNS; run++) {
      runs.push(await measure(page, navigation, subjects));
    }
    rows.push({
      label: navigation.label,
      boundary: Boolean(navigation.boundary),
      latency,
      runs,
    });
    console.log(`✓ ${navigation.label} at +${latency} ms`);
  }
}

await browser.close();

console.log(`\n${table(rows)}\n`);
console.log(
  "All figures in milliseconds after the click" +
    (RUNS > 1 ? `; \`a · b\` is ${RUNS} runs of the same navigation` : "") +
    ".",
);

const { failures, notes } = checkAcceptance(rows);
for (const note of notes) console.log(`· ${note}`);
if (failures.length) {
  console.error(
    `\nThe navigations did not behave:\n- ${failures.join("\n- ")}`,
  );
  process.exit(1);
}
console.log(
  REDUCED_MOTION
    ? "Every boundary's frame paints at the click with its placeholders already visible, and no placeholder blinks."
    : "Every boundary draws its frame before the round trip ends, no placeholder is seen inside the hold, and none blinks.",
);
