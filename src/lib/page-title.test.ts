import { describe, expect, it } from "vitest";

import { PAGE_TITLE_TEMPLATE, pageTitle } from "./page-title";

describe("pageTitle", () => {
  it("names a page, then the product", () => {
    expect(pageTitle("Dashboard")).toBe("Dashboard – OpenDiving");
  });

  it("puts a section between a page inside it and the product", () => {
    expect(pageTitle("#44 El Puertito", "Dives")).toBe(
      "#44 El Puertito – Dives – OpenDiving",
    );
  });

  // The root layout hands the same template to Next, which fills a page's
  // `metadata.title` into it - so a tab named in `metadata` and one named by
  // `useDocumentTitle` read alike.
  it("is the template Next fills a page's metadata title into", () => {
    expect(PAGE_TITLE_TEMPLATE.replace("%s", "Dives")).toBe(pageTitle("Dives"));
  });
});
