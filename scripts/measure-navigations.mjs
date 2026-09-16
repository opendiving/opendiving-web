// Times soft navigations - what happens between a click and the page being done -
// against a production build, and prints them as a markdown table.
//
//   npm run measure-navigations -- you@example.com              # every navigation
//   npm run measure-navigations -- you@example.com dives-gear   # just the named ones
//
//   LATENCIES=0,100,300 npm run measure-navigations -- you@example.com
//   RUNS=2 npm run measure-navigations -- you@example.com       # figures joined with `·`
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
//   First API call done   the first `/api/v1/` response that reached the server finishes
//   Settled               the last DOM mutation under `<main>`: the screen stopped moving
//   Prefetches            what the *source* page fetched before the click: requests
//                         carrying `next-router-prefetch` or `next-router-segment-prefetch`
//
// The claim these numbers exist to check is the *order*: the round trip ends before the
// screen changes, which is the whole "nothing happens" phase of a click. The figures are
// the calibration and move between runs; the order does not.
//
// Origin is a capture-phase `click` listener on `document`, so it is the click itself and
// not the navigation the click eventually causes. The one navigation with no click - Back
// - marks the same clock from the page immediately before `history.back()`.
//
// Latency comes from CDP `Network.emulateNetworkConditions` and is applied to the source
// page's load as well as the navigation, so the prefetch traffic pays it too.
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
import { existsSync } from "node:fs";
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
// where a per-route loading fallback is expected to paint a *different* frame from the one
// the source page drew. The sixth is Back, which is the case a kept-mounted route would
// change and which no click can express.
const NAVIGATIONS = [
  {
    id: "dives-gear",
    label: "Dives → Gear",
    from: () => "/dives",
    target: (page) =>
      page.locator("header").getByRole("link", { name: "Gear", exact: true }),
  },
  {
    id: "dives-dive",
    label: "Dives → dive detail",
    from: () => "/dives",
    target: (page) => diveLink(page),
  },
  {
    id: "dive-pager",
    label: "Dive → neighbouring dive (pager)",
    from: (subjects) => subjects.dive,
    target: (page) => pagerStep(page),
  },
  {
    id: "dashboard-dive",
    label: "Dashboard → dive detail",
    from: () => "/dashboard",
    target: (page) => diveLink(page),
  },
  {
    id: "dive-edit",
    label: "Dive detail → its edit page",
    from: (subjects) => subjects.dive,
    target: (page) =>
      page.locator("main").getByRole("link", { name: "Edit", exact: true }),
  },
  {
    id: "dives-back",
    label: `Back to /dives from a dive (${BACK_ROWS} rows loaded)`,
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
      return {
        prefetchCount: prefetches.length,
        prefetchBytes: prefetches.reduce(
          (total, entry) => total + bytesOf(entry.request),
          0,
        ),
        navigationUrls: new Set(
          requests
            .slice(mark)
            .filter((entry) => entry.rsc && !entry.prefetch)
            .map((entry) => entry.url),
        ),
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

    const mark = { t0: null, firstDom: null, lastDom: null };
    window.__navigationMark = mark;

    document.addEventListener(
      "click",
      () => {
        if (mark.t0 === null) mark.t0 = performance.now();
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
    const { prefetchCount, prefetchBytes, navigationUrls } =
      await traffic.read(mark);

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
        };
      },
      [...navigationUrls],
    );

    const since = (value) =>
      value === null ? null : Math.round(value - timings.t0);
    return {
      rsc: since(timings.rsc),
      dom: since(timings.dom),
      api: since(timings.api),
      settled: since(timings.last),
      prefetchCount,
      prefetchBytes,
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
    "| Navigation | Added latency | RSC round trip ends | Screen changes | First API call done | Settled | Prefetches before the click |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  const body = rows.map(
    ({ label, latency, runs }) =>
      `| ${label} | ${latency === 0 ? "0" : `+${latency}`} | ${cell(runs, "rsc")} | ` +
      `${cell(runs, "dom")} | ${cell(runs, "api")} | ${cell(runs, "settled")} | ` +
      `${cell(runs, "prefetchCount")} req, ${runs.map((run) => kb(run.prefetchBytes)).join(" · ")} |`,
  );
  return [...header, ...body].join("\n");
}

// The acceptance test, asked of the figures rather than of a reader: where there is a
// round trip it ends before the screen changes, in every row, at every latency.
//
// A row with no round trip is a note and not a failure - Back can be answered entirely
// from the router's client cache, and a navigation that needs no server is the outcome
// this whole exercise is aiming at rather than a broken measurement. A row where the
// screen never changed is a failure, because that is the instrument and not the app.
function checkOrder(rows) {
  const failures = [];
  const notes = [];
  for (const { label, latency, runs } of rows) {
    runs.forEach((run, index) => {
      const at = `${label} at +${latency} ms${runs.length > 1 ? ` (run ${index + 1})` : ""}`;
      if (run.dom === null)
        failures.push(`${at}: nothing changed under <main>`);
      else if (run.rsc === null)
        notes.push(`${at}: no RSC round trip - answered from the client cache`);
      else if (run.rsc > run.dom)
        failures.push(
          `${at}: the screen changed at ${run.dom} ms, before the round trip ended at ${run.rsc} ms`,
        );
    });
  }
  return { failures, notes };
}

// ------------------------------------------------------------------- the run
const link = await magicLink();

const browser = await chromium.launch({ executablePath: chromePath });
const context = await browser.newContext({ viewport: VIEWPORT });
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
    rows.push({ label: navigation.label, latency, runs });
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

const { failures, notes } = checkOrder(rows);
for (const note of notes) console.log(`· ${note}`);
if (failures.length) {
  console.error(
    `\nThe round trip did not come first:\n- ${failures.join("\n- ")}`,
  );
  process.exit(1);
}
console.log(
  "The RSC round trip ends before the screen changes in every row that made one.",
);
