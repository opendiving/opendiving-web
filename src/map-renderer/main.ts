// The map renderer: draws a dive's or a trip's card picture for the API, in the
// web image, started with `node map-renderer/index.mjs` rather than the web
// server's `node server.js`. `scripts/build-map-renderer.mjs` bundles this file
// and everything it imports from the web into that one module.
//
// Configured as the web is - the same `MAP_*` variables and `SITE_URL` - plus
// `PORT`, which is 3000 in the image and 3001 beside a dev server.

import { createRequire } from "node:module";
import path from "node:path";

import { startDisplay, type Display } from "./display";
import { createEngine, type NativeModule } from "./engine";
import { createResources } from "./resources";
import { createRendererServer } from "./server";
import { rendererSignature } from "./signature";
import { readRendererConfig } from "./style";

// Set by the build: a digest of the sources this bundle was made from.
declare const __MAP_RENDERER_SOURCE_DIGEST__: string;

const log = (message: string) => console.log(`[map-renderer] ${message}`);

async function main() {
  const port = Number(process.env.PORT || 3001);
  const config = readRendererConfig();
  // The image's `public/`, which its working directory holds, as the web
  // server's does; a checkout's, run from its root.
  const publicDir = path.resolve("public");

  let display: Display | undefined;
  if (process.platform === "linux") {
    display = await startDisplay();
    process.env.DISPLAY = display.name;
    display.onExit((reason) => {
      // Every map drew through it, so there is nothing left to recover:
      // exiting is what has the container restarted with a display again.
      log(reason);
      process.exit(1);
    });
  }

  // Loaded only now: on Linux it needs the display above to draw at all.
  const require = createRequire(import.meta.url);
  const native: NativeModule = require("@maplibre/maplibre-gl-native");
  const nativeVersion: string =
    require("@maplibre/maplibre-gl-native/package.json").version;

  const resources = createResources({ siteUrl: config.siteUrl, publicDir });
  const engine = createEngine({ native, config, resources, log });
  const signature = await rendererSignature({
    sourceDigest: __MAP_RENDERER_SOURCE_DIGEST__,
    nativeVersion,
    config,
    publicDir,
  });

  const server = createRendererServer({
    renderer: {
      isHealthy: () => engine.isReady() && (display?.isUp() ?? true),
      draw: (payload) => engine.draw(payload),
    },
    signature,
    log,
  });
  server.listen(port, () => {
    log(`listening on :${port}, signature ${signature}`);
  });

  // PID 1 in a container gets no default handlers, so a stop is a SIGTERM
  // nothing answers until it is handled here.
  const stop = () => {
    server.close();
    engine.close();
    display?.stop();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((error: unknown) => {
  log(`Could not start: ${(error as Error).stack ?? error}`);
  process.exit(1);
});
