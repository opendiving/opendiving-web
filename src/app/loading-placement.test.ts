import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NO_CHROME_ROUTES } from "@/components/layout/app-shell";

// Where a loading boundary may sit, derived from the tree rather than listed.
//
// The placement is the whole design: the installed router keys a `loading.tsx` on the
// child segment it wraps, so one at the top of a segment paints the destination's shape
// and one beside a `[id]` repaints on every step of the dive pager - which is the
// measured invariant that route group exists to hold. A file in the wrong place is not a
// test failure anywhere else in this suite; it is a page blanking under a diver's hands.
//
// The other half is coverage. A new route inside the chrome that nobody gave a frame is a
// click that goes back to doing nothing for a round trip, and it fails here rather than
// being noticed months later.

const APP = path.join(__dirname);

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

const isClient = (file: string) =>
  readFileSync(file, "utf8").startsWith('"use client"');

const pages = files.filter((file) => file.endsWith("/page.tsx"));

// A destination is a page a signed-in diver navigates to inside the app chrome. The
// server-rendered pages are the public ones and `/admin`'s redirect; the chrome-free ones
// are reached from an email link or a redirect and draw their own layout.
const destinations = pages
  .filter(isClient)
  .map(routeOf)
  .filter(
    (route) =>
      !NO_CHROME_ROUTES.some(
        (free) => route === free || route.startsWith(`${free}/`),
      ),
  )
  // `/settings` renders a spinner on its auth bootstrap rather than waiting on data, so
  // it has no pause to cover and a fallback there would draw grey where none is drawn.
  .filter((route) => route !== "/settings" && !route.startsWith("/settings/"));

const segmentOf = (route: string) => route.split("/")[1];
const expected = [...new Set(destinations.map(segmentOf))].sort();

const boundaries = files
  .filter((file) => file.endsWith("/loading.tsx"))
  .map((file) => rel(file));

describe("loading boundaries", () => {
  it("sits at the top of every segment a diver navigates to, and nowhere else", () => {
    expect(boundaries.sort()).toEqual(
      expected.map((segment) => `${segment}/loading.tsx`),
    );
  });

  it("covers every destination in the derived set", () => {
    const covered = new Set(expected);
    for (const route of destinations) {
      expect(covered.has(segmentOf(route))).toBe(true);
    }
    // A floor, so the derivation failing open is itself a failure.
    expect(destinations.length).toBeGreaterThan(10);
  });

  it("is keyed on no dynamic segment and on no route group", () => {
    for (const file of boundaries) {
      expect(file).not.toMatch(/[[(]/);
      expect(file.split("/")).toHaveLength(2);
    }
  });

  it("leaves the root without one, where it would wrap the whole app", () => {
    expect(boundaries).not.toContain("loading.tsx");
  });
});
