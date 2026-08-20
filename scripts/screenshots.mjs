// Retakes the README screenshots in `docs/screenshots/`.
//
//   npm run screenshots -- you@example.com             # all of them
//   npm run screenshots -- you@example.com dashboard   # just the named ones
//
// Needs the API up (`docker compose up` in opendiving-api) and the dev server on
// http://localhost:3000. It signs in as the given account by requesting a magic link
// and reading the token back out of the API container's log, so it only works against
// a local stack whose logs you can read - see DECISIONS.md.
//
// Chromium comes from CHROME_PATH, or from the usual Chrome install; playwright-core
// only drives it, so `npm install` never downloads a browser.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "docs", "screenshots");
const API_DIR = process.env.API_DIR ?? path.join(root, "..", "opendiving-api");
const WEB = process.env.WEB_URL ?? "http://localhost:3000";
// Same variable the app builds its axios `baseURL` from, so it carries the `/api/v1`
// prefix and the fetches below append only the route. Appending the prefix here as well
// would double it up for anyone who has the variable exported.
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

// One width for every shot. 1024px is Tailwind's `lg`, the width at which every detail
// page's `grid-cols-1 lg:grid-cols-3` stops stacking - so the dive page's chart sits
// beside its site/environment/import sidebar instead of a screen above it.
const WIDTH = 1024;

// Height is per page, because the boundary to cut on is. 1086 ends the dive page below
// its profile chart - clearing the sidebar column beside it - and the gear page below
// its service history. The dashboard's number is measured rather than written down; see
// `CUT_BELOW`, which is why its entry here is only the frame the page loads at.
const HEIGHT = { dashboard: 1564, "dive-detail": 1086, "gear-item": 1086 };

// Where a shot names the card it should end on, the frame is measured in the page just
// before the shutter instead of being kept here as a number. Written-down heights went
// stale twice in one afternoon: dive activity landed under the consumption card and put
// the old cut through the middle of it, and then four words came out of the consumption
// card's description, its header row stopped wrapping, and the cut moved 40px again. A
// hand-measured figure is not even portable between browsers - the two disagreed by 3px
// here, which is the difference between a clean edge and a sliver of the next card.
const CUT_BELOW = { dashboard: "Dive Activity" };
const frame = (name) => ({ width: WIDTH, height: HEIGHT[name] });
// The year both dashboard charts are parked on, on their `Year` scope - twelve months of
// one season in each. One constant, because the two cards showing the *same* period is
// the point: they carry the same All/Year/Month toggle and are meant to read as a pair,
// and a career of bars beside a single July reads as two unrelated cards that happen to
// share a dashboard. Names a year in one particular log, so an account without diving in
// it needs this overridden.
const CHART_YEAR = process.env.CHART_YEAR ?? "2025";

// The hour the dashboard's clock is pinned to before the shutter. Its heading greets by
// time of day (`greetingForHour()`), so an unpinned run shoots whichever greeting it
// happens to be launched at and the README image flips between three of them for no
// reason anyone reading the diff can see. 09:00 on the run's *own* date: only the hour
// is decided here, so everything else derived from the clock - a service "due in 24
// days", the year the charts open on - lands exactly where an unpinned run would put it.
const GREETING_HOUR = Number(process.env.GREETING_HOUR ?? 9);
// Range-checked because `setHours()` rolls rather than rejects: a 25 would pin the clock
// to 01:00 *tomorrow* and quietly take a day off the service countdown - the one thing
// the comment above promises this override does not touch.
if (!Number.isInteger(GREETING_HOUR) || GREETING_HOUR < 0 || GREETING_HOUR > 23) {
  console.error(
    `GREETING_HOUR must be a whole hour from 0 to 23, not "${process.env.GREETING_HOUR}"`,
  );
  process.exit(1);
}

const email = process.argv[2] ?? process.env.SCREENSHOT_EMAIL;
if (!email) {
  console.error("usage: npm run screenshots -- you@example.com [shot...]");
  process.exit(1);
}

// Retaking one image at a time keeps the other two out of the diff. They are not stable
// between runs - "due in 24 days" counts down, and the subjects are picked from whatever
// the log holds that day - so a full retake to change one shot rewrites all three.
const only = process.argv.slice(3);
const unknown = only.filter((name) => !(name in HEIGHT));
if (unknown.length) {
  console.error(
    `unknown shot(s): ${unknown.join(", ")} - pick from ${Object.keys(HEIGHT).join(", ")}`,
  );
  process.exit(1);
}
const wanted = (name) => only.length === 0 || only.includes(name);

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

// --------------------------------------------------------------- what to shoot
// Neither subject is hardcoded, so this runs against any account. Each is picked for the
// page that photographs best: the dive is whichever recent one carries an imported
// profile (only the single-dive endpoint says so, hence the probing), and the gear item
// is whichever has the most service tracked on it.
//
// The queries reuse the access token the app is already sending, lifted off its own
// requests. The alternatives are both worse: a second magic link runs into the
// three-per-email-per-fifteen-minutes limit, and spending the refresh cookie directly
// rotates it out from under the page.
async function pickSubjects(token) {
  const get = async (url) => {
    const response = await fetch(`${API}/${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok ? response.json() : null;
  };

  const user = await get("user");
  const dives = await get(
    `dives?user_uuid=${user.uuid}&page=1&items_per_page=30`,
  );

  let dive = null;
  for (const candidate of dives.data) {
    if (await get(`dive/${candidate.uuid}/profile`)) {
      dive = candidate.uuid;
      break;
    }
  }

  const gear = await get(
    `gear-items?user_uuid=${user.uuid}&page=1&items_per_page=100`,
  );
  const ranked = gear.data
    .filter((item) => (item.service ?? []).length > 0)
    .sort(
      (a, b) =>
        b.service.length - a.service.length || b.dive_count - a.dive_count,
    );

  return { dive, gearItem: (ranked[0] ?? gear.data[0])?.uuid };
}

// ---------------------------------------------------------------- the camera
// The dev-tools bubble sits in a shadow-DOM portal over the bottom-left corner and
// would otherwise land in every shot.
const hideDevTools = (page) =>
  page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
  });

// The top of the first row below the named card, which is the far side of the gap the
// page's `space-y-6` puts between them - so the frame ends on the boundary rather than a
// few pixels into the next card or short of the one before it.
async function cutBelow(page, label) {
  const top = await page.evaluate((text) => {
    const heading = [...document.querySelectorAll("h2, h3")].find((node) =>
      node.textContent.trim().startsWith(text),
    );
    const next = heading?.closest(
      "div.rounded-lg.border.bg-card",
    )?.nextElementSibling;
    return next ? Math.round(next.getBoundingClientRect().top + scrollY) : null;
  }, label);
  if (top === null)
    throw new Error(`nothing below the ${label} card to cut at`);
  return top;
}

async function shot(page, name, height) {
  await page.setViewportSize({ width: WIDTH, height });
  await hideDevTools(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`✓ ${name}.png  ${WIDTH}x${height} @2x`);
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// One of the two dashboard chart cards, by its own heading.
//
// Scoping matters and is easy to get wrong: the cards now carry the same All/Year/Month
// toggle, the same `aria-label="Time range"` on it and the same prev/next labels, so an
// unscoped `Month` or `Previous period with dives` matches both. The toggle's label used
// to be the discriminator ("Bar size" against "Time range"); the heading is the one thing
// the two will never share.
const chartCard = (page, heading) =>
  page
    .locator("div.rounded-lg", {
      has: page.getByRole("heading", { name: heading, exact: true }),
    })
    .last();

// Orders the labels the period control produces, so a walk knows which arrow to press.
// Two shapes, one per scope: "2025" and "July 2025".
const ordinal = (label) => {
  const parts = label.trim().split(" ");
  const year = Number(parts[parts.length - 1]);
  return year * 12 + (parts.length > 1 ? MONTHS.indexOf(parts[0]) : 0);
};

// Parks one of the dashboard's chart cards on a scope and a period.
//
// One walk for both cards, where there used to be one apiece. They now carry the same
// three scopes over the same period control, differing only in the card name each
// control's `aria-label` leads with - which is the whole point of the change that merged
// them.
//
// The arrows are matched on the half of that label they share, as a regex: the card name
// in front of it is what tells a screen reader's controls list which chart it drives, and
// pinning it here would mean this walk breaks every time that wording is improved. The
// `chartCard` scope is what makes matching the shared half unambiguous.
//
// The period picker only exists once the toggle is off `All`, so the scope click has to
// come before the walk. The arrows skip periods with no dives, so stepping is safe
// across the gaps in a log rather than counting through them.
async function selectPeriod(page, heading, scope, target) {
  const card = chartCard(page, heading);
  await card.getByRole("button", { name: scope, exact: true }).click();
  const combobox = card.getByRole("combobox").first();

  for (let step = 0; step < 60; step++) {
    const current = (await combobox.textContent()).trim();
    if (current === target) return;
    const arrow =
      ordinal(current) > ordinal(target)
        ? /previous period with dives/i
        : /next period with dives/i;
    await card.getByRole("button", { name: arrow }).click();
    await page.waitForTimeout(120);
  }
  throw new Error(
    `${heading} has no ${scope.toLowerCase()} "${target}" with dives`,
  );
}

const atTop = (page) => page.evaluate(() => window.scrollTo(0, 0));

// Every full load re-mounts `AuthProvider`, which spends the httpOnly refresh cookie for
// a replacement, so a run is a chain of rotations and any break in it signs the browser
// out. Checking here turns that into a clear failure rather than a set of screenshots of
// the sign-in form - see DECISIONS.md.
//
// The frame is set before the navigation rather than before the shot, so the page lays
// out at its final height on the way in - a card that only renders once it is in view
// then does so as part of the load the `networkidle` wait already covers.
async function visit(page, name, url) {
  await page.setViewportSize(frame(name));
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  if (new URL(page.url()).pathname === "/signin") {
    throw new Error(`signed out on the way to ${url}`);
  }
}

// ------------------------------------------------------------------- the run
const link = await magicLink();

const browser = await chromium.launch({ executablePath: chromePath });
const context = await browser.newContext({
  // Every `visit()` sets the frame for the page it is opening; this is only what the
  // sign-in page gets rendered at on the way through.
  viewport: frame("dashboard"),
  // Retina, so the images stay sharp on the displays most people read a README on.
  deviceScaleFactor: 2,
  colorScheme: "dark",
  reducedMotion: "reduce",
});
// Generous, because the first hit on a route in `next dev` compiles it, and the
// profile chart is a few hundred samples of hand-rolled SVG on top of that.
context.setDefaultTimeout(90_000);

// Set before the first page exists, so every navigation in the run sees the same clock.
// `setFixedTime` only freezes what the page reads out of `Date`; timers and animations
// keep running on the real one, which is what the `networkidle` waits below depend on.
// Nothing here needs the tokens to agree with it either - they are checked against the
// API's own clock, not the browser's.
const pinnedNow = new Date();
pinnedNow.setHours(GREETING_HOUR, 0, 0, 0);
await context.clock.setFixedTime(pinnedNow);

// The dashboard offers a passkey to any account that has none, in a card above the
// charts - and this browser is a fresh profile on every run, so it would land in the
// hero shot whenever the demo account happens to have no passkey. Same class of pin as
// the clock and the chart year: what the README shows should not depend on which state
// the account was left in. Written the way the app writes it (`lib/passkey-nudge.ts`),
// before any page script runs.
await context.addInitScript(() => {
  window.localStorage.setItem("opendiving:passkey-nudge-dismissed", "1");
});

const page = await context.newPage();

let bearer = null;
page.on("request", (request) => {
  const header = request.headers()["authorization"];
  if (header?.startsWith("Bearer ")) bearer = header.slice(7);
});

await page.goto(`${WEB}/auth/verify?token=${link}`);
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("button", { name: "Account menu" }).waitFor();

// The dashboard is where signing in lands, and the only page the bearer can be lifted
// off before anything else needs it - so it gets loaded whether or not it gets shot.
await visit(page, "dashboard", `${WEB}/dashboard`);
// By heading, not by text: the cards carry visually-hidden labels naming the chart
// their period control belongs to ("Gas consumption period"), and `getByText` matches
// case-insensitive substrings - so a bare "Gas Consumption" resolves to two elements
// and fails strict mode. `chartCard` scopes by the heading for the same reason.
await page.getByRole("heading", { name: "Gas Consumption" }).waitFor();

// Skipped when only the dashboard is being retaken: finding the dive costs one request
// per candidate until a profile turns up.
const subjects =
  wanted("dive-detail") || wanted("gear-item")
    ? await pickSubjects(bearer)
    : { dive: null, gearItem: null };
const { dive, gearItem } = subjects;
if (dive || gearItem)
  console.log(`dive ${dive ?? "(none with a profile)"} · gear ${gearItem}`);

if (wanted("dashboard")) {
  await selectPeriod(page, "Gas Consumption", "Year", CHART_YEAR);
  await selectPeriod(page, "Dive Activity", "Year", CHART_YEAR);
  await atTop(page);
  await shot(page, "dashboard", await cutBelow(page, CUT_BELOW.dashboard));
}

// One frame per page, and one page per feature. Two crops of the same page at
// different scroll offsets read as a mistake rather than as two things.
if (wanted("dive-detail")) {
  if (dive) {
    await visit(page, "dive-detail", `${WEB}/dives/${dive}`);
    await page.getByText("Dive Profile").waitFor();
    await atTop(page);
    await shot(page, "dive-detail", HEIGHT["dive-detail"]);
  } else {
    console.warn("! no dive with an imported profile - skipped the dive shot");
  }
}

if (wanted("gear-item")) {
  await visit(page, "gear-item", `${WEB}/gear/${gearItem}`);
  await page.getByText("Service history").waitFor();
  await atTop(page);
  await shot(page, "gear-item", HEIGHT["gear-item"]);
}

await browser.close();
