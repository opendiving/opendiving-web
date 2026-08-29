import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { getWorkerUrl, type Map as MapLibreMap } from "maplibre-gl";

import { MapCanvas } from "./map-canvas";
import { resolveBasemap, type BasemapConfig } from "@/lib/basemap";

// A style with a source the **worker** has to parse, served from nowhere.
//
// That combination is the point. An empty style loads without the worker ever
// doing anything, so a map built on one reaches `load` whether or not the worker
// started - and a worker chunk that never starts fires no error event and writes
// no console line (maplibre-gl-js#8074), which is why this is the one failure
// mode a green suite would otherwise hide. GeoJSON is parsed and indexed worker-
// side, so a source that reports itself loaded is a worker that ran.
const PROBE_STYLE = {
  version: 8 as const,
  sources: {
    probe: {
      type: "geojson" as const,
      data: {
        type: "FeatureCollection" as const,
        features: [
          {
            type: "Feature" as const,
            properties: {},
            geometry: { type: "Point" as const, coordinates: [34.5, 28.5] },
          },
        ],
      },
    },
  },
  layers: [{ id: "probe", type: "circle" as const, source: "probe" }],
};

const asConfig = (): BasemapConfig => ({
  styleUrl: `data:application/json,${encodeURIComponent(JSON.stringify(PROBE_STYLE))}`,
  attribution: "© Someone",
});

function renderCanvas(onMap: (map: MapLibreMap | null) => void) {
  return render(
    <div style={{ position: "relative", width: 320, height: 180 }}>
      <MapCanvas
        basemap={resolveBasemap(asConfig())}
        theme="light"
        onMap={onMap}
        unsupported={<p>This browser cannot display the map.</p>}
      />
    </div>,
  );
}

// The failure this file exists to catch is *silence* - a worker that never
// starts produces no error event and no console line, so the map simply never
// finishes. Waiting on `load` with no ceiling would hang the suite rather than
// fail it, which is the same trap in a different coat.
const LOAD_TIMEOUT = 15_000;

function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`timed out after ${LOAD_TIMEOUT}ms waiting for ${what}`),
          ),
        LOAD_TIMEOUT,
      ),
    ),
  ]);
}

/**
 * A rendered canvas, and a promise of its map having actually finished.
 *
 * `load` is the event that means the style is loaded, every source with it, and
 * one complete frame drawn - so it is the single thing that says the worker did
 * its job, rather than that a container got a canvas in it.
 */
function renderLoaded() {
  let map: MapLibreMap | null = null;
  const loaded = new Promise<MapLibreMap>((resolve) => {
    renderCanvas((instance) => {
      map = instance;
      instance?.once("load", () => resolve(instance));
    });
  });
  return { loaded: withTimeout(loaded, "the map to load"), map: () => map };
}

// In `afterEach` rather than at the end of the test that installs it. The WebGL2
// test below stubs `getContext` on the prototype, and restoring it inline meant
// that when that test *failed* the stub survived into the next one - which then
// rendered the unsupported fallback and failed for a reason that had nothing to
// do with it. One misleading failure per real one is a bad exchange rate.
afterEach(() => {
  vi.restoreAllMocks();
});

describe("MapCanvas", () => {
  // **The check that catches the worker trap.** `setWorkerUrl` names a copy in
  // `public/`, put there by `scripts/copy-maplibre-worker.mjs` - which also
  // copies the sibling the worker imports on its first line. Miss either half
  // and the map mounts, says nothing, and never finishes loading. Nothing else
  // in the suite would notice: markers, labels and the attribution are all
  // drawn before a single tile is parsed.
  it(
    "boots its worker and finishes loading",
    async () => {
      const { loaded } = renderLoaded();
      const map = await loaded;
      // Both halves, because `load` alone could in principle fire for a style
      // with nothing in it: the source that only a worker can have parsed is
      // what makes this a test of the worker.
      expect(map.isSourceLoaded("probe")).toBe(true);
    },
    LOAD_TIMEOUT + 5_000,
  );

  // The other half of the same claim. A same-origin worker URL is what keeps
  // MapLibre on `new Worker(url)` instead of `fetchAsBlobUrl`/`importAsBlobUrl`,
  // and a `blob:` worker is what `worker-src blob:` would have had to permit -
  // upstream's own security note calls that equivalent to `unsafe-eval`, and it
  // is the objection this app rejected MapLibre over for as long as it did.
  it(
    "runs its worker from this origin, not from a blob URL",
    async () => {
      const { loaded } = renderLoaded();
      await loaded;

      expect(getWorkerUrl()).toBe("/maplibre/maplibre-gl-worker.mjs");
      // Asserting the configured URL alone would pass identically whether the
      // same-origin copy loaded or MapLibre fell back to a blob, so read what the
      // browser actually fetched.
      const fetched = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => name.includes("maplibre-gl-worker"));
      expect(fetched.length).toBeGreaterThan(0);
      for (const name of fetched) {
        expect(name.startsWith("blob:")).toBe(false);
        expect(new URL(name).origin).toBe(window.location.origin);
      }
    },
    LOAD_TIMEOUT + 5_000,
  );

  // The sibling the worker imports. It is fetched by the worker rather than by
  // the page, so this says the copy script moved both files - the exact thing
  // Turbopack drops when the worker is referenced as a bundled asset instead.
  it("serves the worker's own sibling beside it", async () => {
    const response = await fetch("/maplibre/maplibre-gl-shared.mjs");
    expect(response.ok).toBe(true);
  });

  // MapLibre v6 has no `isSupported()` and its constructor does not throw on a
  // missing context - it fires an `ErrorEvent` that upstream acknowledges cannot
  // be caught. So the check is ours, and what it buys is a message instead of an
  // empty box.
  it("says so rather than building a map without WebGL2", async () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (
        this: HTMLCanvasElement,
        ...args: Parameters<typeof getContext>
      ) {
        if (args[0] === "webgl2") return null;
        return getContext.apply(this, args);
      } as typeof getContext,
    );

    const onMap = vi.fn();
    renderCanvas(onMap);

    expect(
      screen.getByText("This browser cannot display the map."),
    ).toBeInTheDocument();
    expect(document.querySelector("canvas.maplibregl-canvas")).toBeNull();
    // Nothing was built, so nothing is announced: the container the map would
    // have attached to is never rendered, and a caller's `map` stays at whatever
    // it initialises to. Give it a moment to be sure this is "never" rather than
    // "not yet".
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onMap).not.toHaveBeenCalled();
  });

  // **The theme swap, which is the point of holding two styles rather than one.**
  // A map is built with the style that resolved first and later ones are applied
  // to the live instance, so the WebGL context, the camera and any markers
  // survive a theme change. Nothing else in the suite would notice if `theme`
  // were ignored outright: the light and dark documents have to differ, and the
  // one the map ends up holding has to be read off the instance.
  it(
    "swaps the style on the live map when the theme changes",
    async () => {
      const named = (id: string) =>
        `data:application/json,${encodeURIComponent(
          JSON.stringify({
            version: 8,
            sources: {},
            layers: [
              { id, type: "background", paint: { "background-color": "#fff" } },
            ],
          }),
        )}`;

      const basemap = resolveBasemap({
        styleUrl: named("daylight"),
        styleUrlDark: named("nightfall"),
        attribution: "© Someone",
      });

      let map: MapLibreMap | null = null;
      const canvas = (theme: "light" | "dark") => (
        <div style={{ position: "relative", width: 320, height: 180 }}>
          <MapCanvas
            basemap={basemap}
            theme={theme}
            onMap={(instance) => {
              map = instance;
            }}
            unsupported={<p>This browser cannot display the map.</p>}
          />
        </div>
      );

      const { rerender } = render(canvas("light"));
      await waitFor(() => expect(map).not.toBeNull());
      const instance = map!;
      await waitFor(() =>
        expect(instance.getStyle().layers[0]?.id).toBe("daylight"),
      );

      rerender(canvas("dark"));

      await waitFor(
        () => expect(instance.getStyle().layers[0]?.id).toBe("nightfall"),
        { timeout: LOAD_TIMEOUT },
      );

      // **And back**, which is the half that was broken and the half a
      // one-way test cannot see. A configured style resolves to its URL
      // *string*, so returning to light produces exactly the value the map was
      // built with - and a guard written against that value skips the swap and
      // leaves the map dark for good.
      rerender(canvas("light"));

      await waitFor(
        () => expect(instance.getStyle().layers[0]?.id).toBe("daylight"),
        { timeout: LOAD_TIMEOUT },
      );

      // The same instance throughout: a swap that rebuilt the map would drop the
      // camera and every marker on it, which is the thing this arrangement
      // exists to avoid.
      expect(map).toBe(instance);
    },
    LOAD_TIMEOUT + 5_000,
  );

  // MapLibre ships its own attribution control and renders it as HTML, which
  // `react/no-danger` makes a decision here rather than a default. Suppressing
  // it is what keeps exactly one credit on screen.
  it("suppresses MapLibre's own attribution control", async () => {
    let map: MapLibreMap | null = null;
    renderCanvas((instance) => {
      map = instance;
    });
    await waitFor(() => expect(map).not.toBeNull());
    expect(document.querySelector(".maplibregl-ctrl-attrib")).toBeNull();
  });
});
