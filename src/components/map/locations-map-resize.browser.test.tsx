import { describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { LocationsMap } from "./locations-map";
import { resolveBasemap } from "@/lib/basemap";
import { ConfigProvider } from "@/contexts/ConfigContext";

// **One test, in a file of its own, and that is the finding rather than a
// preference.** Vitest gives each browser test file its own page, and this check
// only holds in a page that has not already built and torn down half a dozen
// WebGL maps: run at the end of `locations-map.browser.test.tsx` it fails
// intermittently, and run first or alone it passes every time. The resize path
// is the only one in this component sensitive to that, because it is the only
// one waiting on the browser's own `ResizeObserver` rather than on React.
//
// The wait below is the other half. A resize reaches the camera through
// MapLibre's observer, and that chain does not complete while anything polls it
// tightly - ten seconds at 100ms leaves the markers exactly where they were,
// whether the poll reads rects or only inline styles, and whether it goes
// through `waitFor` or a hand-rolled loop. Second-long gaps let the same refit
// through. So this checks rarely and waits long, which still fails rather than
// hangs.

const EMPTY_STYLE = `data:application/json,${encodeURIComponent(
  JSON.stringify({ version: 8, sources: {}, layers: [] }),
)}`;

const withConfig = (children: React.ReactNode) => (
  <ConfigProvider
    config={{
      basemap: resolveBasemap({
        styleUrl: EMPTY_STYLE,
        attribution:
          "[© OpenStreetMap](https://www.openstreetmap.org/copyright)",
      }),
    }}
  >
    {children}
  </ConfigProvider>
);

async function settles(condition: () => boolean, what: string, tries = 8) {
  for (let attempt = 0; attempt < tries; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (condition()) return;
  }
  throw new Error(`gave up after ${tries}s waiting for ${what}`);
}

describe("LocationsMap on a frame that changes size", () => {
  // **MapLibre does not refit on its own.** Its `trackResize` calls `resize()`,
  // which recomputes the projection for the new box and leaves centre and zoom
  // where they were - so without an explicit refit a frame that narrows keeps a
  // camera fitted to the wider one and pushes the outermost pins outside it. The
  // hand-rolled renderer got this for free by recomputing from a measured size;
  // this is the test that says the behaviour survived the move.
  it("refits when its frame narrows", async () => {
    const frame = document.createElement("div");
    frame.style.width = "640px";
    document.body.appendChild(frame);

    try {
      render(
        withConfig(
          <LocationsMap
            subject="the trip's locations"
            locations={[
              { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
              { name: "Red Sea", latitude: 27.0, longitude: 34.0 },
            ]}
          />,
        ),
        { container: frame },
      );
      // The first fit, before anything is resized.
      await waitFor(() =>
        expect(frame.querySelectorAll("[data-marker]").length).toBe(2),
      );

      // Everything below is scoped to the frame this test owns rather than to
      // the document: the queries elsewhere in this file are document-wide, and
      // a map from an earlier test still being torn down would answer them.
      const box = () =>
        frame.querySelector('[role="img"]')!.getBoundingClientRect();
      const pins = () =>
        Array.from(frame.querySelectorAll("[data-marker]")).map((marker) =>
          marker.getBoundingClientRect(),
        );
      frame.style.width = "240px";
      await settles(
        () =>
          pins().length === 2 &&
          pins().every(
            (at) => at.left >= box().left - 1 && at.right <= box().right + 1,
          ),
        "the map to refit into the narrowed frame",
      );

      expect(box().width).toBeLessThan(300);
      expect(pins()).toHaveLength(2);
      for (const at of pins()) {
        expect(at.left).toBeGreaterThanOrEqual(box().left - 1);
        expect(at.right).toBeLessThanOrEqual(box().right + 1);
      }
    } finally {
      frame.remove();
    }
  });
});
