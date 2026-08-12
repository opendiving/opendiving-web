// Retakes the README screenshots in `docs/screenshots/`.
//
//   npm run screenshots -- you@example.com
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
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

// One frame for every shot. 1024px is Tailwind's `lg`, the width at which every detail
// page's `grid-cols-1 lg:grid-cols-3` stops stacking - so the dive page's chart sits
// beside its site/environment/import sidebar instead of a screen above it. 1086 is where
// the dashboard's consumption card ends, one row above the cards that follow it; it also
// clears the dive page's sidebar column, so all three cut on a boundary.
const FRAME = { width: 1024, height: 1086 };
// The month the consumption chart is parked on: a full one, so the trend has shape.
const CHART_MONTH = process.env.CHART_MONTH ?? "July 2025";

const email = process.argv[2] ?? process.env.SCREENSHOT_EMAIL;
if (!email) {
  console.error("usage: npm run screenshots -- you@example.com");
  process.exit(1);
}

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
  const response = await fetch(`${API}/api/v1/auth/email/request`, {
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
    const response = await fetch(`${API}/api/v1/${url}`, {
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

async function shot(page, name) {
  await hideDevTools(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`✓ ${name}.png  ${FRAME.width}x${FRAME.height} @2x`);
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

// Walks the consumption chart's period picker to a given month. The arrows skip
// periods with no dives, so stepping is safe across gaps in the log.
async function selectMonth(page, target) {
  await page.getByRole("button", { name: "Month", exact: true }).click();
  const ordinal = (label) => {
    const [month, year] = label.trim().split(" ");
    return Number(year) * 12 + MONTHS.indexOf(month);
  };
  const combobox = page.getByRole("combobox").first();

  for (let step = 0; step < 60; step++) {
    const current = (await combobox.textContent()).trim();
    if (current === target) return;
    const arrow =
      ordinal(current) > ordinal(target)
        ? "Previous period with dives"
        : "Next period with dives";
    await page.getByRole("button", { name: arrow }).click();
    await page.waitForTimeout(120);
  }
  throw new Error(`${target} is not a month with dives`);
}

const atTop = (page) => page.evaluate(() => window.scrollTo(0, 0));

// Every full load re-mounts `AuthProvider`, which spends the httpOnly refresh cookie
// for a replacement. Two of those inside the same wall-clock second currently hand
// back a byte-identical token that the rotation has already blacklisted, and the page
// after that lands on /signin - see `sleepPastTheSecond`. Checking here turns that
// into a clear failure rather than four screenshots of the sign-in form.
async function visit(page, url) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  if (new URL(page.url()).pathname === "/signin") {
    throw new Error(`signed out on the way to ${url}`);
  }
}

// The API's refresh token carries only `sub`, `exp` and `token_type`, and `exp` has
// one-second resolution - so two issued for the same account in the same second are
// the same string. `/auth/refresh` blacklists the one it was given before minting the
// replacement, which in that case blacklists the replacement too. Signing in and
// navigating immediately is the reliable way to hit it; a script does it every time.
// Remove this once the API puts a `jti` on refresh tokens.
const sleepPastTheSecond = (page) =>
  page.waitForTimeout(1000 - (Date.now() % 1000) + 250);

// ------------------------------------------------------------------- the run
const link = await magicLink();

const browser = await chromium.launch({ executablePath: chromePath });
const context = await browser.newContext({
  viewport: FRAME,
  // Retina, so the images stay sharp on the displays most people read a README on.
  deviceScaleFactor: 2,
  colorScheme: "dark",
  reducedMotion: "reduce",
});
// Generous, because the first hit on a route in `next dev` compiles it, and the
// profile chart is a few hundred samples of hand-rolled SVG on top of that.
context.setDefaultTimeout(90_000);

const page = await context.newPage();

let bearer = null;
page.on("request", (request) => {
  const header = request.headers()["authorization"];
  if (header?.startsWith("Bearer ")) bearer = header.slice(7);
});

await page.goto(`${WEB}/auth/verify?token=${link}`);
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("button", { name: "Account menu" }).waitFor();
await sleepPastTheSecond(page);

await visit(page, `${WEB}/dashboard`);
await page.getByText("Gas Consumption").waitFor();

const { dive, gearItem } = await pickSubjects(bearer);
console.log(`dive ${dive ?? "(none with a profile)"} · gear ${gearItem}`);

await selectMonth(page, CHART_MONTH);
await atTop(page);
await shot(page, "dashboard");

// One frame per page, and one page per feature. Two crops of the same page at
// different scroll offsets read as a mistake rather than as two things.
if (dive) {
  await visit(page, `${WEB}/dives/${dive}`);
  await page.getByText("Dive Profile").waitFor();
  await atTop(page);
  await shot(page, "dive-detail");
} else {
  console.warn("! no dive with an imported profile - skipped the dive shot");
}

await visit(page, `${WEB}/gear/${gearItem}`);
await page.getByText("Service history").waitFor();
await atTop(page);
await shot(page, "gear-item");

await browser.close();
