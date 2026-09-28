import { describe, expect, it, vi } from "vitest";

import { metadata as landing } from "@/app/page";
import { metadata } from "./page";

// The landing page's client body is not what this file is about, and importing it
// would pull the whole app's client graph into a metadata check.
vi.mock("@/components/layout/landing-page", () => ({
  LandingPage: () => null,
}));

// `/join` is the landing page with one form swapped, so a crawler that follows a
// join link posted somewhere credits `/` with it: canonical `/`, which the root
// layout's `metadataBase` resolves against `SITE_URL`, and nothing that keeps the page
// out of an index - a `noindex` would throw the link's weight away instead.
describe("/join's metadata", () => {
  it("names the home page as its canonical", () => {
    expect(metadata.alternates?.canonical).toBe("/");
  });

  it("carries the home page's own title and description", () => {
    expect(metadata.title).toEqual(landing.title);
    expect(metadata.description).toBe(landing.description);
  });

  it("asks no crawler to stay away", () => {
    expect(metadata.robots).toBeUndefined();
  });
});
