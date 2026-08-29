// Copies MapLibre's worker out of node_modules and into `public/`, so the
// renderer boots its worker from *this* origin.
//
// Two reasons, and only the first is about the bundler.
//
// Turbopack. MapLibre's own Next.js note says `new URL('maplibre-gl/dist/
// maplibre-gl-worker.mjs', import.meta.url)` is turned into a hashed asset
// without emitting its `maplibre-gl-shared.mjs` sibling, which the worker
// imports on its first line. The map then mounts and silently never requests a
// tile - upstream's maplibre-gl-js#8074 is the same shape: a worker chunk that
// never starts fires no error event and writes no console line. Copying both
// files, side by side, is the documented way out.
//
// The Content-Security-Policy. `setWorkerUrl()` pointed at a same-origin copy is
// what keeps MapLibre off the `blob:` path: `workerFactory()` calls
// `new Worker(url)` directly when `isCrossOrigin(url)` is false, and only falls
// through to `fetchAsBlobUrl`/`importAsBlobUrl` when it is true. A blob worker
// would need `worker-src blob:`, which upstream itself describes as equivalent
// to `unsafe-eval` - the objection that kept this app on a hand-rolled raster
// map until now. See DECISIONS.md.
//
// Wired to every script that can reach a test or a build - `predev`, `prebuild`,
// `pretest`, `pretest:watch` and `pretest:coverage` - because npm resolves a
// pre-hook against the exact script name: `pretest` does not run for
// `npm run test:coverage`, which is what CI runs. A browser test executing
// against a missing worker is the silent failure above, so the copy has to
// precede every entry point rather than the obvious two. `package.json` is the
// list; this comment deliberately does not restate a count of it.

import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const destination = path.join(root, "public", "maplibre");

// Both, and the second is not optional: `maplibre-gl-worker.mjs` imports
// `./maplibre-gl-shared.mjs` by relative path, so it has to land beside it.
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

// Resolved through the package rather than by joining `node_modules` ourselves,
// so a hoisted or linked install is found the same way the bundler finds it.
const source = path.dirname(
  require.resolve("maplibre-gl/dist/maplibre-gl.mjs"),
);

await mkdir(destination, { recursive: true });
for (const file of FILES) {
  await copyFile(path.join(source, file), path.join(destination, file));
}

console.log(`[maplibre] copied ${FILES.join(", ")} to public/maplibre/`);
