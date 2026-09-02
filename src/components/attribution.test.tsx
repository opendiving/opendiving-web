import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Attribution, parseAttribution } from "./attribution";
import { DEFAULT_TILE_ATTRIBUTION } from "@/lib/basemap";

// `parseAttribution` moved here from the hand-rolled renderer's tile module when
// that module went. Nothing about parsing a credit line was basemap arithmetic,
// and half of what reaches this component is the geocoder's credit rather than a
// map's - so it lives beside the component that renders it, and so do its tests.

describe("parseAttribution", () => {
  it("splits links out of the surrounding text", () => {
    expect(
      parseAttribution("Map [© CARTO](https://carto.com/attributions) here"),
    ).toEqual([
      { text: "Map " },
      { text: "© CARTO", href: "https://carto.com/attributions" },
      { text: " here" },
    ]);
  });

  it("reads the raster default's credit as a link to the licence", () => {
    const parts = parseAttribution(DEFAULT_TILE_ATTRIBUTION);
    expect(parts.filter((part) => part.href)).toEqual([
      {
        text: "© OpenStreetMap contributors",
        href: "https://www.openstreetmap.org/copyright",
      },
    ]);
  });

  it("leaves a plain string alone, for a provider with nothing to link to", () => {
    expect(parseAttribution("© Someone")).toEqual([{ text: "© Someone" }]);
  });

  // This string comes from an environment variable or from whatever
  // `GEOCODER_URL` points at, so the one thing it must not do is put an
  // arbitrary scheme into an href.
  it("keeps the label but drops a link that is not http(s)", () => {
    expect(parseAttribution("[Credit](javascript:alert)")).toEqual([
      { text: "Credit" },
    ]);
    expect(parseAttribution("[Credit](data:text/html,x)")).toEqual([
      { text: "Credit" },
    ]);
    expect(parseAttribution("[Credit](not a url)")).toEqual([
      { text: "[Credit](not a url)" },
    ]);
  });
});

describe("Attribution", () => {
  it("renders the linked part as a link that leaves the form alone", () => {
    render(
      <Attribution value="Data from [OpenStreetMap](https://www.openstreetmap.org/copyright)" />,
    );

    const link = screen.getByRole("link", { name: "OpenStreetMap" });
    expect(link).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
    // These appear inside dialogs holding a half-filled form, and navigating
    // away in the same tab would throw it away.
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  // The whole reason this takes a string and parses it: `react/no-danger` is an
  // error in this repo, and a credit line is exactly the sort of "it's only
  // markup" HTML that gets waved through.
  it("renders markup in the credit as text rather than as elements", () => {
    const { container } = render(
      <Attribution value="© <b>Someone</b> [x](https://example.com)" />,
    );

    expect(container.querySelector("b")).toBeNull();
    expect(container).toHaveTextContent("© <b>Someone</b> x");
  });
});
