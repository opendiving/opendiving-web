// Retakes the README screenshots in `docs/screenshots/`, and the product repo's copies of
// the same three images when a clone of it is on disk beside this one.
//
//   npm run screenshots -- you@example.com             # all of them
//   npm run screenshots -- you@example.com dashboard   # just the named ones
//
//   DIVE_UUID=<uuid> npm run screenshots -- you@example.com dive-detail
//                                                      # that dive, not the ranked one
//
// Needs the API up (`docker compose up` in opendiving-api) and the dev server on
// http://localhost:3000. It signs in as the given account by requesting a magic link
// and reading the token back out of the API container's log, so it only works against
// a local stack whose logs you can read - see DECISIONS.md.
//
// Chromium comes from CHROME_PATH, or from the usual Chrome install; playwright-core
// only drives it, so `npm install` never downloads a browser.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "docs", "screenshots");
const API_DIR = process.env.API_DIR ?? path.join(root, "..", "opendiving-api");
// The product repo renders these same three images on the page the project is judged on,
// and has nothing that can retake them - the app they are of is here. So this script
// writes both copies from one shutter press rather than leaving the front page to rot on
// a screenshot of an older UI. Same `../sibling` shape as API_DIR, and skipped with a note
// when that clone is absent: one clone has to remain enough to run this.
const PRODUCT_DIR =
  process.env.PRODUCT_DIR ?? path.join(root, "..", "opendiving");
const PRODUCT_OUT = existsSync(PRODUCT_DIR)
  ? path.join(PRODUCT_DIR, "docs", "screenshots")
  : null;
// Committing them there is a separate, manual step: this script has no business making
// commits in a repository it does not live in.
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

// Height is per page, because the boundary to cut on is. 1086 ends the gear page below
// its service history. The other two are measured rather than written down; see
// `CUT_BELOW`, which is why their entries here are only the frame the page loads at.
const HEIGHT = { dashboard: 1564, "dive-detail": 1086, "gear-item": 1086 };

// Where a shot names a card it must reach, the frame is measured in the page just before
// the shutter instead of being kept here as a number. Written-down heights went stale
// twice in one afternoon: dive activity landed under the consumption card and put the old
// cut through the middle of it, and then four words came out of the consumption card's
// description, its header row stopped wrapping, and the cut moved 40px again. A
// hand-measured figure is not even portable between browsers - the two disagreed by 3px
// here, which is the difference between a clean edge and a sliver of the next card.
//
// The name is a floor, not the boundary: `cutBelow()` goes on down to the first height at
// which no card at all is still open (see it for why). So this names the card the image
// exists to show - `Recordings` on the dive page, which is what the whole shot is for -
// rather than the one that happens to sit last, which is a fact about the account's data
// and not something to write down here.
const CUT_BELOW = { dashboard: "Dive Activity", "dive-detail": "Recordings" };
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
if (
  !Number.isInteger(GREETING_HOUR) ||
  GREETING_HOUR < 0 ||
  GREETING_HOUR > 23
) {
  console.error(
    `GREETING_HOUR must be a whole hour from 0 to 23, not "${process.env.GREETING_HOUR}"`,
  );
  process.exit(1);
}

// The dive the `dive-detail` shot is of, when the rank in `pickSubjects()` cannot tell the
// candidates apart. The rank is a count and counts tie: in a log whose dives each came off
// one computer every candidate scores one, so the winner is whichever is most recent - and
// recency is not a property worth photographing. Set, this is used as given and the ranking
// is skipped rather than run and overruled; absent - the ordinary case - nothing changes.
//
// Present but blank is rejected rather than read as absent, in the same spirit as the range
// check above: `DIVE_UUID=$SOMETHING` with `SOMETHING` unset is a caller that meant to name
// a dive, and quietly ranking instead is the one outcome this variable exists to rule out.
const DIVE_UUID = process.env.DIVE_UUID?.trim() ?? null;
if (DIVE_UUID === "") {
  console.error("DIVE_UUID is set but empty - name a dive uuid, or leave it unset");
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

// A note rather than a failure: most people running this have one clone, and the product
// repo's copies are the maintainer's errand.
if (!PRODUCT_OUT) {
  console.log(
    `· no product repo at ${PRODUCT_DIR} - writing this repository's copies only (set PRODUCT_DIR to change that)`,
  );
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
// page that photographs best: the dive is whichever recent one has the most recordings
// carrying samples (only the single-dive endpoint carries them, hence the probing), and
// the gear item is whichever has the most service tracked on it. `DIVE_UUID` overrides
// the first of those where the rank has nothing to go on; the gear item has no such
// escape hatch, because its rank has not needed one.
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

  // How many of a dive's recordings have samples to chart - the rank below, and the one
  // thing a named dive is still held to. Only the dive read carries `recordings`; the
  // list response deliberately leaves them off, so there is no way to ask this without a
  // fetch apiece.
  const chartedIn = (detail) =>
    (detail?.recordings ?? []).filter((recording) => recording.profile).length;

  const user = await get("user");

  let dive = null;
  let chartedRecordings = 0;
  if (DIVE_UUID) {
    // Read once to check it, and the ranking below is skipped entirely rather than run
    // and overruled - which saves its request per candidate as well as settling the
    // argument.
    //
    // Both ways this can be wrong throw, and neither falls back to the ranking: a run
    // that quietly photographed a different dive than the one it was handed would say so
    // in a line of output nobody reads, which is the failure this script keeps
    // re-teaching (see DECISIONS.md). They throw whenever the subjects are picked rather
    // than only when the dive shot is wanted, because a uuid that does not resolve is a
    // mistake in the invocation and the cheapest run to find it in is this one.
    const detail = await get(`dive/${DIVE_UUID}`);
    if (!detail)
      throw new Error(
        `DIVE_UUID ${DIVE_UUID}: GET /dive/{uuid} did not answer - check the uuid, and that the dive is one of ${email}'s`,
      );
    chartedRecordings = chartedIn(detail);
    if (chartedRecordings === 0)
      throw new Error(
        `DIVE_UUID ${DIVE_UUID} has no recording carrying samples - the profile card would render nothing and the \`Dive Profile\` wait would time out`,
      );
    dive = DIVE_UUID;
  } else {
    const dives = await get(
      `dives?user_uuid=${user.uuid}&page=1&items_per_page=30`,
    );

    // Ranked, not filtered, and the rank is how many of the dive's recordings carry
    // samples. Two of those draw the page's whole recordings story - the Recordings
    // card listing both computers, and the switcher above the chart, which
    // `DiveProfileCard` only renders once a second recording has a profile - and that
    // is what this image exists to show. But a log whose dives each came off one
    // computer is the ordinary case rather than a failed search, and one of those is
    // an honest picture of the same page. Zero is the only disqualifier: the card
    // renders nothing at all without samples, so the page would photograph flat and
    // the `Dive Profile` wait below would time out.
    //
    // Every candidate is read, with no early exit, because the best one is not known
    // until the last has been looked at - the list is in start-time order, not in
    // anything this ranks on. Ties keep the earliest seen, so a run against a log with
    // no two-recording dive still picks the most recent single one - which is what
    // `DIVE_UUID` is there to overrule, since that is every dive in most logs.
    for (const candidate of dives.data) {
      const charted = chartedIn(await get(`dive/${candidate.uuid}`));
      if (charted > chartedRecordings) {
        dive = candidate.uuid;
        chartedRecordings = charted;
      }
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

  return {
    dive,
    chartedRecordings,
    gearItem: (ranked[0] ?? gear.data[0])?.uuid ?? null,
  };
}

// ---------------------------------------------------------------- the camera
// The dev-tools bubble sits in a shadow-DOM portal over the bottom-left corner and
// would otherwise land in every shot.
const hideDevTools = (page) =>
  page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
  });

// The first height at or below the named card where the page has a clean seam all the way
// across: every card that begins above the cut also ends above it, and the cut sits in the
// gap `space-y-6` leaves between rows rather than a few pixels into the card after it.
//
// It used to be one line - the top of the named card's next sibling - and that was right
// for exactly as long as every shot cut on the dashboard, which is one column. The dive
// page is two. `Recordings` is a card in the narrow sidebar, so its neighbour's top is a
// coordinate in that column, and the main column beside it was part-way down the gas
// consumption card at the same height: the frame came out with a sentence sliced through
// the middle of a line of text.
//
// Growing until nothing is open is the fix, and it has to be a loop rather than one sweep
// over what the anchor's own bottom crosses. On that page the sweep ends part-way into the
// sidebar card *below* the anchor, which by definition was not open at the anchor's bottom
// and so was never looked at; taking that one in then reaches into the main column's next
// card, and only the third pass settles. The cut can therefore land a long way below the
// card that named it - far enough that the frame is most of the page - and that is a fact
// about how the page staggers, not a number to talk down: a seam is where the two columns
// happen to finish together, and there may be only one below the anchor.
async function cutBelow(page, label) {
  const measured = await page.evaluate((text) => {
    const CARD = "div.rounded-lg.border.bg-card";
    // Nested cards need no excluding: one is inside its parent's box on both edges, so it
    // is open only where the parent already is and can never move the cut on its own.
    const cards = [...document.querySelectorAll(CARD)];
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top + scrollY, bottom: rect.bottom + scrollY };
    };

    const anchor = [...document.querySelectorAll("h2, h3")]
      .find((node) => node.textContent.trim().startsWith(text))
      ?.closest(CARD);
    if (!anchor) return { height: null, why: "no card carries that heading" };

    // The gap between rows, read off the anchor's own neighbour rather than written down.
    // Either neighbour will do, and the one above is not a fallback for tidiness: a card
    // named at the bottom of its column has nothing below it to measure against, and used
    // to be refused outright even though the far column ran on past it.
    const previous = anchor.previousElementSibling;
    const next = anchor.nextElementSibling;
    const gutter = next
      ? box(next).top - box(anchor).bottom
      : previous
        ? box(anchor).top - box(previous).bottom
        : null;
    if (gutter === null)
      return {
        height: null,
        why: "that card has no neighbour to measure the gap from",
      };

    // Seeded from the neighbour's top where there is one, so a page with nothing open
    // across the seam - the dashboard, every shot before the dive page - measures exactly
    // what the single line above it did, to the pixel.
    let cut = next ? box(next).top : box(anchor).bottom + gutter;
    // Each pass that moves the cut has to have found a card the pass before it could not
    // see, so one per card is more than it can ever need and the loop cannot spin.
    for (let pass = 0; pass <= cards.length; pass++) {
      const open = cards.filter((card) => box(card).top < cut);
      const grown = Math.max(
        cut,
        ...open.map((card) => box(card).bottom + gutter),
      );
      if (grown === cut) return { height: Math.round(cut), why: null };
      cut = grown;
    }
    return { height: null, why: "the cut never settled" };
  }, label);
  if (measured.height === null)
    throw new Error(`cannot cut below the ${label} card: ${measured.why}`);
  return measured.height;
}

// One shutter press, written to both trees from the buffer it returns. Shooting twice
// would produce two *different* images - the pages are live, and "due in 24 days" counts
// down between them - so the copies would drift the moment anyone looked closely.
async function shot(page, name, height) {
  await page.setViewportSize({ width: WIDTH, height });
  await hideDevTools(page);
  await page.waitForTimeout(400);
  const png = await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  if (PRODUCT_OUT) {
    mkdirSync(PRODUCT_OUT, { recursive: true });
    writeFileSync(path.join(PRODUCT_OUT, `${name}.png`), png);
  }
  console.log(
    `✓ ${name}.png  ${WIDTH}x${height} @2x${PRODUCT_OUT ? " (+ product repo)" : ""}`,
  );
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

// Skipped when only the dashboard is being retaken: ranking the dives costs one request
// per candidate, for all thirty of them.
const subjects =
  wanted("dive-detail") || wanted("gear-item")
    ? await pickSubjects(bearer)
    : { dive: null, chartedRecordings: 0, gearItem: null };
const { dive, chartedRecordings, gearItem } = subjects;
// Says which mechanism chose the dive as well as which dive it chose, so a run whose
// `DIVE_UUID` went unread - misspelled in the environment, dropped by a wrapper - is
// visible in its own output rather than only in the image that comes out.
const diveNote = dive
  ? `${dive} (${chartedRecordings} charted recording${chartedRecordings === 1 ? "" : "s"}, ${DIVE_UUID ? "named by DIVE_UUID" : "ranked"})`
  : "(none with samples)";
if (dive || gearItem)
  console.log(`dive ${diveNote} · gear ${gearItem ?? "(none)"}`);

// A requested shot with no subject is a failure, not a note - and it fails here, before
// the first shutter press, so a run that cannot produce all of what was asked for leaves
// no half-updated set of images behind. The dive shot warned and exited 0 for a week
// after the route it probed was removed, which is exactly long enough for nobody to
// notice that the README was still showing a page the app no longer draws.
if (wanted("dive-detail") && !dive)
  throw new Error(
    `no dive of ${email} has a recording with a profile - nothing to shoot for dive-detail`,
  );
if (wanted("gear-item") && !gearItem)
  throw new Error(`${email} has no gear - nothing to shoot for gear-item`);

if (wanted("dashboard")) {
  await selectPeriod(page, "Gas Consumption", "Year", CHART_YEAR);
  await selectPeriod(page, "Dive Activity", "Year", CHART_YEAR);
  await atTop(page);
  await shot(page, "dashboard", await cutBelow(page, CUT_BELOW.dashboard));
}

// One frame per page, and one page per feature. Two crops of the same page at
// different scroll offsets read as a mistake rather than as two things.
if (wanted("dive-detail")) {
  await visit(page, "dive-detail", `${WEB}/dives/${dive}`);
  await page.getByText("Dive Profile").waitFor();
  await atTop(page);
  await shot(
    page,
    "dive-detail",
    await cutBelow(page, CUT_BELOW["dive-detail"]),
  );
}

if (wanted("gear-item")) {
  await visit(page, "gear-item", `${WEB}/gear/${gearItem}`);
  await page.getByText("Service history").waitFor();
  await atTop(page);
  await shot(page, "gear-item", HEIGHT["gear-item"]);
}

await browser.close();
