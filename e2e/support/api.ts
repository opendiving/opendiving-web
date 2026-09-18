import { test as base, type Page, type Route } from "@playwright/test";

import type { User } from "@/lib/api/auth";
import type {
  Dive,
  DiveNeighbors,
  DiveNumberingSummary,
} from "@/lib/api/dives";
import type { GearItem, GearSet } from "@/lib/api/gear";
import type { PaginatedResponse } from "@/lib/api/client";

/**
 * The API these tests run against is a set of fixtures served out of the
 * browser, not a server: CI runs no API container and standing one up is a
 * launch-sized investment. `page.route()` is the right layer because
 * `lib/api-base.ts` makes the base a *relative* `/api/v1` when
 * `NEXT_PUBLIC_API_URL` is empty, so every call — the auth bootstrap included —
 * is a same-origin request this router sees before it leaves the browser.
 */

export const ACCESS_TOKEN = "e2e-access-token";

export const USER: User = {
  uuid: "11111111-1111-4111-8111-111111111111",
  name: "Test Diver",
  username: "testdiver",
  email: "diver@example.com",
  avatar_sha256: null,
  units: "metric",
  dive_form_hidden_fields: [],
};

// Two dives, so the pager has somewhere to step. `DIVE_A` is the later of the
// two, which is the one `/dives` lists first and the one `previous`/`next` are
// derived against: `DiveNeighbors` is chronological, so A's *previous* is B.
export const DIVE_A: Dive = {
  uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  dive_number: 212,
  start_time: "2026-04-17T11:49:23+02:00",
  duration: 47,
  max_depth: 28.4,
  dive_sites: [
    { uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Blue Hole" },
  ],
  gear_items: [],
  notes: "",
  user_uuid: USER.uuid,
  created_at: "2026-04-17T14:00:00+02:00",
  mixtures: [],
  recordings: [],
  species: [],
};

export const DIVE_B: Dive = {
  uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  dive_number: 211,
  start_time: "2026-04-16T09:12:00+02:00",
  duration: 52,
  max_depth: 18.2,
  dive_sites: [
    { uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "The Canyon" },
  ],
  gear_items: [],
  notes: "",
  user_uuid: USER.uuid,
  created_at: "2026-04-16T12:00:00+02:00",
  mixtures: [],
  recordings: [],
  species: [],
};

export const GEAR_ITEM: GearItem = {
  uuid: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  name: "Scubapro MK25",
  brand: "Scubapro",
  type: "regulator",
  rented: false,
  is_archived: false,
  dive_count: 212,
  service: [],
  user_uuid: USER.uuid,
  created_at: "2024-01-05T10:00:00+01:00",
};

export const GEAR_SET: GearSet = {
  uuid: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  name: "Warm water single tank",
  gear_items: [],
  user_uuid: USER.uuid,
  created_at: "2024-01-05T10:05:00+01:00",
};

const NUMBERING: DiveNumberingSummary = {
  total_dives: 2,
  lowest: DIVE_B.dive_number,
  highest: DIVE_A.dive_number,
  missing_count: 0,
  duplicate_count: 0,
  out_of_date_order_count: 0,
  is_sequential: true,
};

function page1<T>(rows: T[]): PaginatedResponse<T> {
  return {
    data: rows,
    total_count: rows.length,
    has_more: false,
    page: 1,
    items_per_page: 10,
  };
}

const NEIGHBORS: Record<string, DiveNeighbors> = {
  [DIVE_A.uuid]: {
    previous: {
      uuid: DIVE_B.uuid,
      dive_number: DIVE_B.dive_number,
      start_time: DIVE_B.start_time,
    },
    next: null,
  },
  [DIVE_B.uuid]: {
    previous: null,
    next: {
      uuid: DIVE_A.uuid,
      dive_number: DIVE_A.dive_number,
      start_time: DIVE_A.start_time,
    },
  },
};

const DIVES: Record<string, Dive> = {
  [DIVE_A.uuid]: DIVE_A,
  [DIVE_B.uuid]: DIVE_B,
};

/** What a request to `/api/v1<path>` is answered with, or undefined for a 404. */
function respond(method: string, path: string): unknown | undefined {
  if (method === "POST" && path === "/auth/refresh") {
    return { access_token: ACCESS_TOKEN };
  }
  if (method !== "GET") return undefined;

  if (path === "/user") return USER;
  if (path === "/dives/numbering") return NUMBERING;
  if (path === "/dives") return page1([DIVE_A, DIVE_B]);
  if (path === "/gear-items") return page1([GEAR_ITEM]);
  if (path === "/gear-sets") return page1([GEAR_SET]);

  const neighbors = /^\/dive\/([0-9a-f-]+)\/neighbors$/.exec(path);
  if (neighbors) return NEIGHBORS[neighbors[1]];

  const dive = /^\/dive\/([0-9a-f-]+)$/.exec(path);
  if (dive) return DIVES[dive[1]];

  return undefined;
}

interface Gate {
  promise: Promise<void>;
  open: () => void;
}

function gate(): Gate {
  let open = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/**
 * The fixture server, plus the two things the tests steer it with.
 *
 * `hold()` is the load-bearing one. `instant()` defers the *server's* dynamic
 * data, and it blocks `window.fetch` while its scope is open — but every page
 * here is a Client Component that reads its data through axios, which uses
 * `XMLHttpRequest` in the browser and so goes out regardless. Nothing in the
 * framework holds this app's own data back, so the test holds it: the
 * destination's endpoints are gated before the click and released after the
 * scope, which is what makes "the frame, and not the data" an assertion rather
 * than a race against the fixture's own speed.
 */
export class ApiMock {
  #held: RegExp[] = [];
  #gate: Gate | null = null;
  /** Pathnames the router asked the server to prefetch, without the `/api/v1` ones. */
  readonly prefetched = new Set<string>();
  /** Paths this mock answered 404 to — a fixture gap reads as one of these. */
  readonly unmatched: string[] = [];

  /** Hold every matching `/api/v1` path until `release()`. Replaces any previous hold. */
  hold(...patterns: RegExp[]): void {
    this.#held = patterns;
    this.#gate = gate();
  }

  /** Let the held requests through. Safe to call when nothing is held. */
  release(): void {
    this.#gate?.open();
    this.#gate = null;
    this.#held = [];
  }

  async handle(route: Route): Promise<void> {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, "");
    const body = respond(request.method(), path);

    if (body === undefined) {
      this.unmatched.push(`${request.method()} ${path}`);
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: `No fixture for ${path}` }),
      });
      return;
    }

    const held = this.#gate;
    if (held && this.#held.some((pattern) => pattern.test(path))) {
      await held.promise;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  }
}

export async function installApiMock(page: Page): Promise<ApiMock> {
  const mock = new ApiMock();

  page.on("request", (request) => {
    // Both header spellings: a shell prefetch and a segment prefetch are
    // different requests and either one warms the destination.
    const headers = request.headers();
    if (
      headers["next-router-prefetch"] ||
      headers["next-router-segment-prefetch"]
    ) {
      mock.prefetched.add(new URL(request.url()).pathname);
    }
  });

  await page.route("**/api/v1/**", (route) => mock.handle(route));
  return mock;
}

export const test = base.extend<{ api: ApiMock }>({
  // The second parameter is Playwright's `use`, renamed: `react-hooks` reads a
  // bare `use(...)` here as a React hook called outside a component and fails
  // the lint. It is positional, so the name is free.
  api: async ({ page }, runTest) => {
    const mock = await installApiMock(page);
    await runTest(mock);
    // A test that fails inside an `instant()` scope leaves its hold in place,
    // and a route handler still awaiting it would keep the context from closing
    // tidily. Teardown always opens the gate.
    mock.release();
  },
});

export { expect } from "@playwright/test";
