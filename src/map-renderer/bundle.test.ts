import { build } from "esbuild";
import { describe, expect, it } from "vitest";

// The renderer's signature hashes every source that reaches its bundle
// (`scripts/build-map-renderer.mjs`), and the API stores tiles under it - so a
// source in the bundle that draws nothing into a tile has every stored tile
// drawn again whenever it is edited. How the cards and the heroes lay tiles
// out is the likeliest such source to creep in, through a shared module.

describe("the renderer's bundle", () => {
  it("reaches none of how the cards and the heroes lay tiles out", async () => {
    const { metafile } = await build({
      entryPoints: ["src/map-renderer/main.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      external: ["@maplibre/maplibre-gl-native", "sharp"],
      tsconfig: "tsconfig.json",
      outfile: "index.mjs",
      write: false,
      metafile: true,
      logLevel: "silent",
    });
    const [{ inputs }] = Object.values(metafile.outputs);
    const reached = Object.keys(inputs).filter(
      (input) => inputs[input].bytesInOutput > 0,
    );

    expect(reached).toContain("src/lib/map-grid.ts");
    expect(reached).not.toContain("src/lib/map-camera.ts");
    expect(reached).not.toContain("src/lib/map-frame.ts");
    expect(
      reached.filter((input) => input.startsWith("src/components/")),
    ).toEqual([]);
  });
});
