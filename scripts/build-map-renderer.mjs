#!/usr/bin/env node
// Builds the map renderer into `build/map-renderer/`: one module bundling
// `src/map-renderer/main.ts` and everything it imports from the web, and a
// `node_modules/` holding the two native packages it loads at run time - which
// is all the Dockerfile copies into the image, beside the web server's own
// standalone output.
//
// The bundle carries a digest of the sources it was built from, which the
// renderer folds into its signature. The sources rather than the bundle's own
// bytes, so a bundler upgrade that only reformats its output does not have
// every stored tile drawn again.

import { createHash } from "node:crypto";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "build", "map-renderer");

// Loaded by the renderer, never bundled: both are native addons.
const NATIVE = ["@maplibre/maplibre-gl-native", "sharp"];

const options = {
  absWorkingDir: root,
  entryPoints: ["src/map-renderer/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: NATIVE,
  tsconfig: "tsconfig.json",
  logLevel: "warning",
};

// One pass to learn the inputs, a second to write the bundle that names them.
// Only the inputs that reach the bundle: an import tree-shaken away, such as
// the date formatting `lib/trip-parts.ts` also exports, draws nothing.
const outfile = path.join(out, "index.mjs");
const { metafile } = await build({
  ...options,
  outfile,
  write: false,
  metafile: true,
});
const [{ inputs }] = Object.values(metafile.outputs);
const digest = createHash("sha256");
const reached = Object.keys(inputs)
  .filter((input) => inputs[input].bytesInOutput > 0)
  .sort();
for (const input of reached) {
  digest.update(`${input}\0`);
  digest.update(readFileSync(path.join(root, input)));
  digest.update("\0");
}

rmSync(out, { recursive: true, force: true });
await build({
  ...options,
  outfile,
  define: {
    __MAP_RENDERER_SOURCE_DIGEST__: JSON.stringify(digest.digest("hex")),
  },
});

// Where Node would find `name` from `from`, walking up through `node_modules`.
function packageDir(name, from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    if (dir === path.dirname(dir)) return null;
  }
}

// A package and what it needs at run time, flattened into one `node_modules/`.
// Optional dependencies are what an install left for this platform - sharp's
// libvips build for it, and nothing for any other.
function copyPackage(name, from, { withDependencies }) {
  const dir = packageDir(name, from);
  if (!dir) return;
  const target = path.join(out, "node_modules", name);
  if (existsSync(target)) return;
  cpSync(dir, target, {
    recursive: true,
    filter: (source) => !source.startsWith(path.join(dir, "node_modules")),
  });
  if (!withDependencies) return;
  const manifest = JSON.parse(readFileSync(path.join(dir, "package.json")));
  for (const dependency of Object.keys({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
  })) {
    copyPackage(dependency, dir, { withDependencies: true });
  }
}

// MapLibre Native's own dependencies are its install script's - fetching the
// prebuilt binary - and nothing it loads: its `index.js` requires the binary
// beside it and no other module.
copyPackage("@maplibre/maplibre-gl-native", root, { withDependencies: false });
copyPackage("sharp", root, { withDependencies: true });

for (const name of NATIVE) {
  if (!existsSync(path.join(out, "node_modules", name))) {
    throw new Error(`${name} is not installed - run npm ci first.`);
  }
}
// Its install script is what downloads the binary, and an npm that blocks
// install scripts leaves a package with nothing in it to load.
const binary = path.join(
  out,
  "node_modules/@maplibre/maplibre-gl-native/lib",
  `node-v${process.versions.modules}`,
  "mbgl.node",
);
if (!existsSync(binary)) {
  throw new Error(
    `MapLibre Native has no binary for this Node (${path.relative(out, binary)}). ` +
      "Its install script fetches it: check that npm ran it.",
  );
}
