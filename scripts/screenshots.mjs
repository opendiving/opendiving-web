// Retakes the README screenshots in `docs/screenshots/`, and the product repo's copies of
// the same images when a clone of it is on disk beside this one.
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
// The product repo renders these same images on the page the project is judged on,
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

// Height is per page, because the boundary to cut on is. Every entry here is the frame
// the page *loads* at - see `CUT_BELOW` and `CUT_AFTER_CARD` for the two rules that
// measure the real one in the page moments before the shutter - except `gear-item`, whose
// entry is also the height it is shot at.
//
// 911 is written down because it is not a property of the gear page at all: it is the
// height at which `gear-item.png` stacked over `dive-site.png` comes level with
// `dive-detail.png` beside them in the README row. That makes it the one figure in this
// file that goes stale when a *different* image is re-framed, which is a real cost and is
// argued out in DECISIONS.md rather than here.
//
// It is the foot of the `Service` card with no gutter under it, which the other three
// shots would each have added - and that is the whole of the travel this lever has left.
// The pair has to come level with a dive shot that lost 458px when it was retaken, so the
// height that would balance the row exactly is *inside* the Service card, and every stop
// that keeps a gutter overshoots. DECISIONS.md has the residuals at five container widths.
//
// What it has to be on this page is a height that does not end through a row - the same
// thing `cutAfterCard()` guarantees for the shot that measures. Nothing here can guarantee
// it, because the rows are that account's service schedules and dives and they move: the
// figure this replaced, 1086, had been cutting a dive row through the middle of its date
// for as long as anyone had been looking at it. So the page is asked before the shutter -
// `refuseSlicedRow()` below.
const HEIGHT = {
  dashboard: 1564,
  "dive-detail": 1086,
  "gear-item": 911,
  "dive-site": 1086,
};

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

// The other framing rule, for a shot that is about one column: the frame ends at the foot
// of the named card and whatever is beside it runs on past the edge.
//
// `CUT_BELOW` exists so that nothing is ever sliced, and this deliberately gives that up,
// so it is worth saying where the line is. The dive-site page is two cards - the whole
// list of dives at the site in the main column, the site's details with its map in the
// sidebar - and they finish together in exactly one place: the bottom of the page. A seam
// there is the entire page, which is not what this shot is for. The map is, and it sits
// 200px from the top of a sidebar card that ends less than half way down.
//
// What gets sliced is the one shape a cut can honestly land in: a list of rows, which
// reads as a page that goes on rather than as a frame that stopped by accident - the
// distinction the section this rule is recorded under already draws. Do not reach for
// this where the far column is prose or a chart.
const CUT_AFTER_CARD = { "dive-site": "Dive Site Information" };
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

// The dive the `dive-detail` shot is of, when the rank in `pickDive()` cannot tell the
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
  console.error(
    "DIVE_UUID is set but empty - name a dive uuid, or leave it unset",
  );
  process.exit(1);
}

const email = process.argv[2] ?? process.env.SCREENSHOT_EMAIL;
if (!email) {
  console.error("usage: npm run screenshots -- you@example.com [shot...]");
  process.exit(1);
}

// Retaking one image at a time keeps the rest out of the diff. They are not stable
// between runs - "due in 24 days" counts down, and the subjects are picked from whatever
// the log holds that day - so a full retake to change one shot rewrites every one of them.
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
// No subject is hardcoded, so this runs against any account. Each is picked for the page
// that photographs best: the dive is whichever recent one has the most recordings
// carrying samples (only the single-dive endpoint carries them, hence the probing), the
// gear item is whichever has the most service tracked on it, and the dive site is
// whichever *placed* one has the most dives at it. `DIVE_UUID` overrides the first of
// those where the rank has nothing to go on; the other two have no such escape hatch,
// because their ranks have not needed one.
//
// The queries reuse the access token the app is already sending, lifted off its own
// requests. The alternatives are both worse: a second magic link runs into the
// three-per-email-per-fifteen-minutes limit, and spending the refresh cookie directly
// rotates it out from under the page.
//
// Each search is skipped when nothing being shot needs it, which is what `asked` is for:
// ranking the dives costs a request per candidate and ranking the sites costs one per
// placed site, and a run retaking one image should not pay for the other's search.
async function pickSubjects(token, asked) {
  const get = async (url) => {
    const response = await fetch(`${API}/${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok ? response.json() : null;
  };

  const { dive, chartedRecordings } = asked("dive-detail")
    ? await pickDive(get)
    : { dive: null, chartedRecordings: 0 };

  const gear = asked("gear-item")
    ? await get(`gear-items?page=1&items_per_page=100`)
    : { data: [] };
  const ranked = gear.data
    .filter((item) => (item.service ?? []).length > 0)
    .sort(
      (a, b) =>
        b.service.length - a.service.length || b.dive_count - a.dive_count,
    );

  const { site, siteDives } = asked("dive-site")
    ? await pickSite(get)
    : { site: null, siteDives: 0 };

  return {
    dive,
    chartedRecordings,
    gearItem: (ranked[0] ?? gear.data[0])?.uuid ?? null,
    site,
    siteDives,
  };
}

// How many of a dive's recordings have samples to chart - the rank below, and the one
// thing a named dive is still held to. Only the dive read carries `recordings`; the list
// response deliberately leaves them off, so there is no way to ask this without a fetch
// apiece.
const chartedIn = (detail) =>
  (detail?.recordings ?? []).filter((recording) => recording.profile).length;

// The dive whose page is worth photographing: the one `DIVE_UUID` names, or failing that
// the recent one with the most recordings carrying samples.
//
// **A named dive skips the ranking entirely** rather than running it and overruling the
// answer, which saves its request per candidate as well as settling the argument.
//
// Both ways a named dive can be wrong throw, and neither falls back to the ranking: a run
// that quietly photographed a different dive than the one it was handed would say so only
// in a line of output nobody reads, which is the failure this script keeps re-teaching
// (see DECISIONS.md). They throw while the subjects are still being picked, before the
// first shutter press, so a mistyped uuid costs a run and not an image - and only on a run
// that is actually shooting this page, since `asked` skips the search otherwise.
async function pickDive(get) {
  if (DIVE_UUID) {
    const detail = await get(`dive/${DIVE_UUID}`);
    if (!detail)
      throw new Error(
        `DIVE_UUID ${DIVE_UUID}: GET /dive/{uuid} did not answer - check the uuid, and that the dive is one of ${email}'s`,
      );
    const chartedRecordings = chartedIn(detail);
    if (chartedRecordings === 0)
      throw new Error(
        `DIVE_UUID ${DIVE_UUID} has no recording carrying samples - the profile card would render nothing and the \`Dive Profile\` wait would time out`,
      );
    return { dive: DIVE_UUID, chartedRecordings };
  }

  const dives = await get(`dives?page=1&items_per_page=30`);

  // Ranked, not filtered, and the rank is how many of the dive's recordings carry
  // samples. Two of those draw the page's whole recordings story - the Recordings card
  // listing both computers, and the switcher above the chart, which `DiveProfileCard`
  // only renders once a second recording has a profile - and that is what this image
  // exists to show. But a log whose dives each came off one computer is the ordinary case
  // rather than a failed search, and one of those is an honest picture of the same page.
  // Zero is the only disqualifier: the card renders nothing at all without samples, so the
  // page would photograph flat and the `Dive Profile` wait below would time out.
  //
  // Every candidate is read, with no early exit, because the best one is not known until
  // the last has been looked at - the list is in start-time order, not in anything this
  // ranks on. Ties keep the earliest seen, so a run against a log with no two-recording
  // dive still picks the most recent single one - which is what `DIVE_UUID` is there to
  // overrule, since that is every dive in most logs.
  let dive = null;
  let chartedRecordings = 0;
  for (const candidate of dives.data) {
    const charted = chartedIn(await get(`dive/${candidate.uuid}`));
    if (charted > chartedRecordings) {
      dive = candidate.uuid;
      chartedRecordings = charted;
    }
  }
  return { dive, chartedRecordings };
}

// The site whose page is worth photographing: one that has a position, and among those
// the one with the most dives logged at it.
//
// **A position is the only hard requirement**, unlike every other subject here, where the
// rank is a preference and nothing is disqualified. The map is what this shot exists for
// and `LocationsMap` renders nothing at all for a site without coordinates, so a site
// with none is not a worse picture of the page - it is a picture of a different page.
//
// Dive count is the preference on top of that, because a site somebody keeps going back
// to is what the page is for, and it is not in the list schema: `/dive-sites` carries the
// name, the position and nothing counted, so the count is one scoped `/dives` request per
// placed site, read off `total_count` with a single row asked for. The whole site list has
// to be paged through first for the same reason the count does not come free - the API
// caps `items_per_page` at 100 and a diver's list runs past that.
//
// The first placed site seeds the answer, so a log whose sites are all placed and none
// dived still produces a picture rather than an error. Ties keep the earliest seen, which
// is name order, the order `/dive-sites` returns.
async function pickSite(get) {
  const sites = [];
  for (let page = 1; ; page++) {
    const response = await get(
      `dive-sites?page=${page}&items_per_page=100`,
    );
    if (!response) break;
    sites.push(...response.data);
    if (!response.has_more) break;
  }

  const placed = sites.filter(
    (candidate) => candidate.latitude != null && candidate.longitude != null,
  );

  let site = placed[0]?.uuid ?? null;
  let siteDives = 0;
  for (const candidate of placed) {
    const scoped = await get(
      `dives?dive_site_uuid=${candidate.uuid}&page=1&items_per_page=1`,
    );
    const count = scoped?.total_count ?? 0;
    if (count > siteDives) {
      site = candidate.uuid;
      siteDives = count;
    }
  }
  return { site, siteDives };
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

// The foot of the named card, nudged clear of any row it would have cut through - the
// other rule, the one that lets the far column run on past the frame. See `CUT_AFTER_CARD`
// for when that is the right thing to do and when it is not.
//
// **A card may be cut through; a row may not.** Those are different things even though
// the first shot to use this rule ran the line four pixels above a dive row's bottom
// border, which looks like a clipped row rather than a list that continues - the whole
// claim this rule rests on. So the cut moves down past a row it lands inside, to the top
// of the one after it, which is where `cutBelow` seeds from for the same reason: the gap
// is fully drawn and the next row contributes no sliver.
//
// Rows are bordered boxes like cards are, and nesting is what tells them apart - the dive
// list's rows are `<a class="rounded-lg border">` inside the card, so a row has a bordered
// ancestor and a card does not. Looping rather than sweeping once because a pass that
// moves the cut can land it inside a row of some other list; each pass clears one row's
// bottom, so it is bounded by the rows on the page and cannot spin.
//
// The gutter is read off the grid the card sits in rather than off a neighbour, because a
// column of one card has no neighbour to measure against - which is exactly the shape this
// rule is for. `rowGap` is a resolved length whatever the breakpoint, so the figure is
// still measured in the page being photographed and not written down here.
async function cutAfterCard(page, label) {
  const measured = await page.evaluate((text) => {
    const CARD = "div.rounded-lg.border.bg-card";
    const BOXED = ".rounded-lg.border";
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top + scrollY, bottom: rect.bottom + scrollY };
    };

    const anchor = [...document.querySelectorAll("h2, h3")]
      .find((node) => node.textContent.trim().startsWith(text))
      ?.closest(CARD);
    if (!anchor) return { height: null, why: "no card carries that heading" };

    const grid = anchor.closest("div.grid");
    const gutter = grid ? parseFloat(getComputedStyle(grid).rowGap) : NaN;
    if (!Number.isFinite(gutter))
      return {
        height: null,
        why: "that card sits in no grid with a row gap to measure",
      };

    const rows = [...document.querySelectorAll(BOXED)].filter((element) =>
      element.parentElement?.closest(BOXED),
    );

    let cut = box(anchor).bottom + gutter;
    for (let pass = 0; pass <= rows.length; pass++) {
      const sliced = rows.find(
        (row) => box(row).top < cut && box(row).bottom > cut,
      );
      if (!sliced) return { height: Math.round(cut), why: null };
      const next = sliced.nextElementSibling;
      cut = next ? box(next).top : box(sliced).bottom + gutter;
    }
    return { height: null, why: "the cut never cleared the rows below it" };
  }, label);
  if (measured.height === null)
    throw new Error(`cannot cut after the ${label} card: ${measured.why}`);
  return measured.height;
}

// The one check a written-down height cannot do for itself: that it does not end inside a
// row. `cutAfterCard()` gets this for free because it measures; `HEIGHT["gear-item"]` is a
// figure about the README row rather than about the gear page, so nothing moves it when
// the page moves under it - and the page does move, because those rows are the account's
// service schedules and dives.
//
// Loud rather than corrected, deliberately. Snapping the frame to the nearest gap would
// keep the shot clean and silently change the height the README row is balanced against,
// which is the failure this script has already had twice with heights that were merely
// stale. Same definition of a row as `cutAfterCard()`: a bordered box nested inside
// another.
async function refuseSlicedRow(page, name, height) {
  const sliced = await page.evaluate((cut) => {
    const BOXED = ".rounded-lg.border";
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top + scrollY, bottom: rect.bottom + scrollY };
    };
    return (
      [...document.querySelectorAll(BOXED)]
        .filter((element) => element.parentElement?.closest(BOXED))
        .map((element) => ({
          ...box(element),
          text: (element.textContent ?? "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 60),
        }))
        .find((row) => row.top < cut && row.bottom > cut) ?? null
    );
  }, height);
  if (sliced)
    throw new Error(
      `the ${name} frame of ${height} cuts through the row running ${sliced.top} to ${sliced.bottom} ("${sliced.text}"). ` +
        `That height is written down in HEIGHT and the page has moved under it - see DECISIONS.md for what it is chosen against before changing it.`,
    );
}

// A blank frame where the map should be is roughly the size of a flat PNG of the same
// box, and a drawn coastline is many times that. Well clear of both, so it separates them
// rather than measuring either: the empty dark frame comes back around a kilobyte.
const MAP_PAINT_FLOOR = 8_000;

// Waits for MapLibre to have actually drawn, which nothing else in this script can tell.
//
// `networkidle` settles when the tile requests stop arriving, which is before the
// renderer has put them on screen, and the WebGL context is built without
// `preserveDrawingBuffer` - so a page script that copies the canvas reads an empty buffer
// however much is visible on it. A map that photographs as an empty box is the failure
// this shot is most exposed to and the one least likely to be noticed, since every other
// wait would report success.
//
// So the map is photographed to find out. Playwright captures through the compositor,
// which sees the WebGL surface the way a screenshot of the whole page will, and a PNG of
// a flat frame compresses to a small fraction of one with a coastline in it. Two captures
// running that are byte-identical and over the floor is a map that is both drawn and no
// longer moving - MapLibre fades its labels in, so "drawn" alone would be a frame taken
// mid-fade.
async function mapPainted(page) {
  const canvas = page.locator("canvas").first();
  let previous = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const png = await canvas.screenshot();
    if (png.length >= MAP_PAINT_FLOOR && previous?.equals(png)) return png;
    previous = png;
    await page.waitForTimeout(500);
  }
  throw new Error(
    `the map never settled into a drawn frame (last capture ${previous?.length ?? 0} bytes, floor ${MAP_PAINT_FLOOR})`,
  );
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

// Skipped when only the dashboard is being retaken, and each search inside it is skipped
// on its own: ranking the dives costs one request per candidate, for all thirty of them.
const subjects =
  wanted("dive-detail") || wanted("gear-item") || wanted("dive-site")
    ? await pickSubjects(bearer, wanted)
    : { dive: null, chartedRecordings: 0, gearItem: null, site: null };
const { dive, chartedRecordings, gearItem, site, siteDives } = subjects;
// Says which mechanism chose the dive as well as which dive it chose, so a run whose
// `DIVE_UUID` went unread - misspelled in the environment, dropped by a wrapper - is
// visible in its own output rather than only in the image that comes out.
const diveNote = dive
  ? `${dive} (${chartedRecordings} charted recording${chartedRecordings === 1 ? "" : "s"}, ${DIVE_UUID ? "named by DIVE_UUID" : "ranked"})`
  : "(none with samples)";
if (dive || gearItem || site)
  console.log(
    `dive ${diveNote} · gear ${gearItem ?? "(none)"} · site ${site ? `${site} (${siteDives} dive${siteDives === 1 ? "" : "s"})` : "(none placed)"}`,
  );

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
if (wanted("dive-site") && !site)
  throw new Error(
    `no dive site of ${email} has coordinates - nothing to shoot for dive-site`,
  );

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
  await refuseSlicedRow(page, "gear-item", HEIGHT["gear-item"]);
  await shot(page, "gear-item", HEIGHT["gear-item"]);
}

if (wanted("dive-site")) {
  await visit(page, "dive-site", `${WEB}/sites/${site}`);
  await page
    .getByRole("heading", { name: CUT_AFTER_CARD["dive-site"] })
    .waitFor();
  // The frame is settled before the map is checked, rather than leaving it to `shot()`:
  // MapLibre redraws whenever its box changes, so a check answered at the loading frame
  // would be a check on a canvas that is about to be drawn again.
  const height = await cutAfterCard(page, CUT_AFTER_CARD["dive-site"]);
  await page.setViewportSize({ width: WIDTH, height });
  await atTop(page);
  await mapPainted(page);
  await shot(page, "dive-site", height);
}

await browser.close();
