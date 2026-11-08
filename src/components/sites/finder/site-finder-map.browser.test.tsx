import { Activity } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { Map as MapLibreMap } from "maplibre-gl";

import { resolveBasemap } from "@/lib/basemap";
import { ConfigProvider } from "@/contexts/ConfigContext";
import type { CommonsDiveSitePoints } from "@/lib/api/dive-sites";
import { SiteFinderMap, type SiteFinderMapProps } from "./site-finder-map";

// Without the app's stylesheet the frame below measures nothing, and a map with
// no size draws nothing to query - see "jsdom answers no layout question, and
// the browser lane only answers one with the stylesheet loaded" in DECISIONS.md.
import "@/app/globals.css";

// Real MapLibre, because clustering is the renderer's: what is asserted is what
// it drew. The style draws nothing and fetches nothing, as the other map tests'.
const EMPTY_STYLE = `data:application/json,${encodeURIComponent(
  JSON.stringify({ version: 8, sources: {}, layers: [] }),
)}`;

// Three hundred records along the Red Sea coast, and one in Fiji.
const COMMONS: CommonsDiveSitePoints = {
  version: "v1",
  sources: {
    osm: "[OpenStreetMap contributors](https://www.openstreetmap.org/copyright)",
  },
  points: [
    ...Array.from(
      { length: 300 },
      (_, i) =>
        [
          34.4 + (i % 20) * 0.01,
          28.2 + Math.floor(i / 20) * 0.02,
          `site-${i}`,
          `Site ${i}`,
          "osm",
        ] as [number, number, string, string, string],
    ),
    [178.4, -18.1, "fiji", "Fiji reef", "osm"],
  ],
};

const COMMONS_LAYERS = ["finder-commons-clusters", "finder-commons-points"];

function renderMap(props: Partial<SiteFinderMapProps> = {}) {
  let instance: MapLibreMap | null = null;
  const onViewChange = vi.fn();
  render(
    <ConfigProvider
      config={{
        basemap: resolveBasemap({ styleUrl: EMPTY_STYLE, attribution: "Test" }),
      }}
    >
      <div className="relative h-96 w-[640px]">
        <SiteFinderMap
          commons={COMMONS}
          yours={[]}
          yoursOnly={false}
          target={null}
          highlight={null}
          onViewChange={onViewChange}
          onPointPick={() => {}}
          onMap={(map) => (instance = map)}
          {...props}
        />
      </div>
    </ConfigProvider>,
  );
  return { map: () => instance!, onViewChange };
}

const idle = async (map: MapLibreMap) => {
  if (!map.loaded() || !map.getSource("finder-commons")) {
    await new Promise((resolve) => map.once("idle", resolve));
  }
  await waitFor(() =>
    expect(
      map.queryRenderedFeatures({ layers: COMMONS_LAYERS }).length,
    ).toBeGreaterThan(0),
  );
};

describe("SiteFinderMap", () => {
  it("draws the Commons as clusters at a world view, far fewer than its points", async () => {
    const { map } = renderMap();
    await waitFor(() => expect(map()).not.toBeNull());
    await idle(map());

    const drawn = map().queryRenderedFeatures({ layers: COMMONS_LAYERS });
    const clusters = drawn.filter((feature) => feature.properties?.cluster);
    expect(clusters.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(10);
    expect(
      clusters.reduce(
        (sum, feature) => sum + Number(feature.properties?.point_count),
        0,
      ),
    ).toBeGreaterThanOrEqual(300);
  });

  it("zooms into a cluster that is tapped, and says the diver moved it", async () => {
    const { map, onViewChange } = renderMap();
    await waitFor(() => expect(map()).not.toBeNull());
    await idle(map());
    const before = map().getZoom();

    const [cluster] = map()
      .queryRenderedFeatures({ layers: ["finder-commons-clusters"] })
      .filter((feature) => Number(feature.properties?.point_count) >= 300);
    const geometry = cluster.geometry as { coordinates: number[] };
    const point = map().project(geometry.coordinates as [number, number]);
    const canvas = map().getCanvas();
    const box = canvas.getBoundingClientRect();
    onViewChange.mockClear();
    canvas.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: box.left + point.x,
        clientY: box.top + point.y,
      }),
    );

    await waitFor(() => expect(map().getZoom()).toBeGreaterThan(before), {
      timeout: 3000,
    });
    await waitFor(
      () => expect(onViewChange).toHaveBeenCalledWith(expect.anything(), true),
      {
        timeout: 3000,
      },
    );
  });

  it("hides the Commons under Your sites", async () => {
    const { map } = renderMap({ yoursOnly: true });
    await waitFor(() => expect(map()).not.toBeNull());
    await new Promise((resolve) => map().once("idle", resolve));

    await waitFor(() =>
      expect(
        map().getLayoutProperty("finder-commons-clusters", "visibility"),
      ).toBe("none"),
    );
    expect(
      map().queryRenderedFeatures({ layers: COMMONS_LAYERS }),
    ).toHaveLength(0);
  });

  it("fits a box across the antimeridian the short way round, as the finder's own move", async () => {
    const { map, onViewChange } = renderMap({
      target: {
        id: 1,
        target: {
          kind: "bounds",
          south: -19,
          north: -16,
          west: 177,
          east: -179,
        },
      },
    });
    await waitFor(() => expect(map()).not.toBeNull());

    await waitFor(() =>
      expect(Math.abs(map().getCenter().wrap().lng)).toBeGreaterThan(178),
    );
    expect(onViewChange).not.toHaveBeenCalledWith(expect.anything(), true);
  });

  // A route left stays mounted under a hidden Activity, and comes back with a
  // new map: it opens where the old one was, not on the world.
  it("comes back where it was after its route is hidden and shown", async () => {
    let instance: MapLibreMap | null = null;
    const host = (hidden: boolean) => (
      <Activity mode={hidden ? "hidden" : "visible"}>
        <ConfigProvider
          config={{
            basemap: resolveBasemap({
              styleUrl: EMPTY_STYLE,
              attribution: "Test",
            }),
          }}
        >
          <div className="relative h-96 w-[640px]">
            <SiteFinderMap
              commons={COMMONS}
              yours={[]}
              yoursOnly={false}
              target={{
                id: 1,
                target: { kind: "point", latitude: 28.5, longitude: 34.5 },
              }}
              highlight={null}
              onViewChange={() => {}}
              onPointPick={() => {}}
              onMap={(map) => (instance = map)}
            />
          </div>
        </ConfigProvider>
      </Activity>
    );
    const { rerender } = render(host(false));
    await waitFor(() => expect(instance?.getCenter().lat).toBeCloseTo(28.5));

    rerender(host(true));
    rerender(host(false));

    await waitFor(() => expect(instance).not.toBeNull());
    await waitFor(() => {
      expect(instance!.getCenter().lat).toBeCloseTo(28.5);
      expect(instance!.getCenter().lng).toBeCloseTo(34.5);
      expect(instance!.getZoom()).toBeCloseTo(10);
    });
  });
});
