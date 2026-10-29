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

// The sha256 of MapLibre Native's `mbgl.node` on each platform the image is
// built for. Its install script downloads the file from a GitHub release and
// checks nothing, so this is what would notice a replaced one. A bump of the
// package fails the build until the new version's hashes are here, beside the
// `allowScripts` pin in `package.json` that moves with them - deliberately, so
// a new binary is let in by a person rather than by a lockfile. For version V:
//
//   curl -fsSL https://github.com/maplibre/maplibre-native/releases/download/node-vV/node-v137-linux-x64-Release.tar.gz |
//     tar -xzO node-v137/mbgl.node | shasum -a 256
//
// and again for `linux-arm64`. Elsewhere - a Mac running `npm run build` - the
// binary never reaches an image, and is not checked.
const MAPLIBRE_NATIVE = {
  version: "6.4.1",
  sha256: {
    "linux-x64-node-v137":
      "b52e834bf5db70b28ddb50664b284675e86a49186ecc711162c4c87873776b9c",
    "linux-arm64-node-v137":
      "21325a102054e914dc70e197fcd4fe76cbcf4cf7d95e42962d7c5688ff42335c",
  },
};

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
// Only the inputs that reach the bundle: an import tree-shaken away entirely
// draws nothing.
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
const maplibre = path.join(out, "node_modules/@maplibre/maplibre-gl-native");
const target = `${process.platform}-${process.arch}-node-v${process.versions.modules}`;
const binary = path.join(
  maplibre,
  "lib",
  `node-v${process.versions.modules}`,
  "mbgl.node",
);
if (!existsSync(binary)) {
  throw new Error(
    `MapLibre Native has no binary for this Node (${path.relative(out, binary)}). ` +
      "Its install script fetches it, and npm runs that only for the version " +
      "`allowScripts` in package.json names.",
  );
}
if (process.platform === "linux") {
  const { version } = JSON.parse(
    readFileSync(path.join(maplibre, "package.json")),
  );
  const expected =
    version === MAPLIBRE_NATIVE.version && MAPLIBRE_NATIVE.sha256[target];
  if (!expected) {
    throw new Error(
      `No recorded sha256 for MapLibre Native ${version} on ${target}: ` +
        "add it to MAPLIBRE_NATIVE in scripts/build-map-renderer.mjs.",
    );
  }
  const actual = createHash("sha256")
    .update(readFileSync(binary))
    .digest("hex");
  if (actual !== expected) {
    throw new Error(
      `MapLibre Native's binary for ${target} hashes to ${actual}, ` +
        `not the ${expected} recorded for ${version}.`,
    );
  }
}
