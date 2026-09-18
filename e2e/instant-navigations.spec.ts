import { instant } from "@next/playwright";

import {
  DIVE_A,
  DIVE_B,
  GEAR_ITEM,
  GEAR_SET,
  expect,
  test,
  type ApiMock,
} from "./support/api";

/**
 * The three navigations the owner named, as CI assertions.
 *
 * **What an `instant()` scope can and cannot see here.** Every page in this app
 * is a Client Component, so a soft navigation has no server render to defer.
 * What the scope holds back is the *shell*: the click commits from what the
 * router already holds or it does not commit at all, and what lands is the
 * destination page's own first render — the `*-page-frame` it draws around rows
 * it has not got yet. The page's data is a browser request through axios, which
 * uses `XMLHttpRequest`; `instant()` gates `window.fetch` and never sees it. So
 * "the frame and not the data" is not something the scope gives us — `hold()`
 * is what gives it, by keeping the destination's endpoints pending across the
 * scope. Without that, a frame that quietly stopped painting would be hidden by
 * data arriving fast enough to look like one.
 *
 * **Assert at a point the click has actually reached.** The URL moves before
 * the tree commits, so `waitForURL` is not that point, and on the pager step
 * every assertion is about a page that already looks right — the dive being
 * stepped away from. Each test therefore waits for something only the
 * destination's own render can produce before asserting: the gear frame's
 * heading, the detail frame's busy region.
 *
 * `instant()` assumes a warm cache, so each test waits for the destination
 * route's shell prefetch first. Without it the click has nothing to commit and
 * `waitForURL` times out — a real failure mode, but not the one under test.
 */

declare global {
  interface Window {
    /** Every distinct `<h1>` text the pager step produced, in order. */
    __h1Texts?: string[];
  }
}

/**
 * Wait until the destination's shell has been prefetched.
 *
 * One shell per *route*, not per link, so a dynamic route is matched by pattern
 * rather than by the pathname about to be clicked: `/dives` draws a link per
 * dive and they share a single `/dives/[id]` shell, whichever one's URL the
 * router happened to fetch it under.
 */
const DIVE_ROUTE = /^\/dives\/[0-9a-f-]{36}$/;

async function prefetched(api: ApiMock, route: RegExp) {
  await expect
    .poll(() => [...api.prefetched].some((seen) => route.test(seen)), {
      message: `no shell prefetch matching ${route}`,
      timeout: 15_000,
    })
    .toBe(true);
}

test.describe("instant navigations", () => {
  test("dives → gear paints the gear frame at the click", async ({
    page,
    api,
  }) => {
    await page.goto("/dives");
    await expect(
      page.getByRole("heading", { level: 1, name: "Dives" }),
    ).toBeVisible();
    await prefetched(api, /^\/gear$/);

    api.hold(/^\/gear-items$/, /^\/gear-sets$/);

    await instant(page, async () => {
      await page
        .locator("header")
        .getByRole("link", { name: "Gear", exact: true })
        .click();
      await page.waitForURL((url) => url.pathname === "/gear");

      // Only `/gear`'s own render draws this, so it is both the assertion and
      // the proof that the click committed.
      await expect(
        page.getByRole("heading", { level: 1, name: "Gear" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: /Your Gear/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: /Gear Sets/ }),
      ).toBeVisible();
      // Both cards stand their table in and mark it busy rather than drawing a
      // spinner, and neither has a row yet.
      await expect(page.locator("main table[aria-busy='true']")).toHaveCount(2);
      await expect(page.getByText(GEAR_ITEM.name)).toHaveCount(0);
      await expect(page.getByText(GEAR_SET.name)).toHaveCount(0);
    });

    api.release();
    await expect(page.getByText(GEAR_ITEM.name)).toBeVisible();
    await expect(page.getByText(GEAR_SET.name)).toBeVisible();
  });

  test("dives → a dive paints the detail frame at the click", async ({
    page,
    api,
  }) => {
    await page.goto("/dives");
    await expect(
      page.getByRole("link", { name: `View dive #${DIVE_A.dive_number}` }),
    ).toBeVisible();
    await prefetched(api, DIVE_ROUTE);

    api.hold(new RegExp(`^/dive/${DIVE_A.uuid}`));

    await instant(page, async () => {
      await page
        .getByRole("link", { name: `View dive #${DIVE_A.dive_number}` })
        .click();
      await page.waitForURL((url) => url.pathname === `/dives/${DIVE_A.uuid}`);

      // The frame is the real back link — the one control worth having during
      // the wait, already where it will be — over a placeholder title.
      await expect(
        page.getByRole("link", { name: "Back to dives" }),
      ).toBeVisible();
      await expect(page.locator("h1 .animate-skeleton")).toBeVisible();
      // The title is a placeholder bar, so the heading has no text yet. Said
      // this way rather than as "the dive's site name is absent": under Cache
      // Components the router keeps the route just left mounted under
      // `<Activity mode="hidden">`, so `/dives`' own rows are still in the
      // document and a `getByText` would find one. Role queries read the
      // accessibility tree and skip that subtree, which is why every other
      // assertion here is one.
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("");
    });

    api.release();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `Dive #${DIVE_A.dive_number}`,
    );
  });

  test("a pager step keeps the dive on screen and the pager focused", async ({
    page,
    api,
  }) => {
    await page.goto("/dives");
    await prefetched(api, DIVE_ROUTE);
    await page
      .getByRole("link", { name: `View dive #${DIVE_A.dive_number}` })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `Dive #${DIVE_A.dive_number}`,
    );

    const pager = page.getByRole("navigation", { name: "Adjacent dives" });
    const previous = pager.getByRole("link").first();
    await expect(previous).toHaveAttribute("href", `/dives/${DIVE_B.uuid}`);

    api.hold(new RegExp(`^/dive/${DIVE_B.uuid}`));
    await previous.focus();

    // Tag the two nodes this step is about, and start recording what the `<h1>`
    // ever says. A tag is lost when its node is replaced, which is exactly the
    // regression the route-group hoist and the pager's bare `<a>` exist to
    // prevent — and one a locator that re-resolves by role would not notice.
    await page.evaluate(() => {
      document.querySelector("h1")?.setAttribute("data-e2e-node", "h1");
      (document.activeElement as HTMLElement | null)?.setAttribute(
        "data-e2e-node",
        "pager",
      );
      const seen: string[] = [];
      window.__h1Texts = seen;
      const record = () => {
        const text = document.querySelector("h1")?.textContent ?? "(no h1)";
        if (seen[seen.length - 1] !== text) seen.push(text);
      };
      record();
      new MutationObserver(record).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });

    const heading = page.locator("h1[data-e2e-node='h1']");
    const pressed = page.locator("a[data-e2e-node='pager']");

    await instant(page, async () => {
      await previous.click();
      await page.waitForURL((url) => url.pathname === `/dives/${DIVE_B.uuid}`);

      // `dives/(detail)/layout.tsx` re-rendering for the new uuid is what turns
      // this on, so it is the point the step has reached the tree — before it,
      // every assertion below is about the page that has not moved yet.
      await expect(page.locator("main div[aria-busy='true']")).toBeVisible();

      // Nothing unmounts: the layout sits above the dynamic segment, so the
      // dive being stepped away from is still on screen in the same `<h1>`, the
      // node the diver pressed still holds the keyboard, and no skeleton bar is
      // drawn anywhere.
      await expect(heading).toHaveText(`Dive #${DIVE_A.dive_number}`);
      await expect(pressed).toBeFocused();
      await expect(page.locator("main .animate-skeleton")).toHaveCount(0);
    });

    api.release();
    await expect(heading).toHaveText(`Dive #${DIVE_B.dive_number}`);
    await expect(pressed).toBeFocused();
    expect(await page.evaluate(() => window.__h1Texts)).toEqual([
      `Dive #${DIVE_A.dive_number}`,
      `Dive #${DIVE_B.dive_number}`,
    ]);
  });
});
