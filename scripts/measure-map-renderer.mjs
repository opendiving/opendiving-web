#!/usr/bin/env node
// Measures a built image the way the flagship would run it - each container held
// to half a CPU and 512 MB, Render's `0.5c-512mb` - and prints the figures as
// markdown: what a tile takes to draw cold and warm, the renderer queue the
// API's deadline covers at the slowest of them, what the renderer's container
// holds after 200 tiles, what the web server holds, and how big the image is.
//
//   node scripts/measure-map-renderer.mjs ghcr.io/opendiving/opendiving-web@sha256:...
//
// Publish Image runs it on its amd64 runner when dispatched with `measure`;
// figures from anywhere else - an arm64 laptop, amd64 under emulation - say
// nothing about the flagship. Needs Docker and nothing from npm.
//
// **It makes a handful of tiles' worth of requests to OpenFreeMap and no
// more.** The cold tiles fetch the default basemap over the network, as a
// first view of a region on an instance does. Everything after that is served
// from here: a few more tiles are recorded through a proxy, and the 200-tile
// run is answered from that recording - each source tile it asks for given a
// recorded one of the same zoom, each glyph range a recorded range - so it
// exercises 200 distinct tiles' worth of keys without asking OpenFreeMap for
// them.
//
// `MEASURE_RENDERS` sets the length of the memory run (200).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IMAGE = process.argv[2];
if (!IMAGE) {
  console.error("usage: node scripts/measure-map-renderer.mjs <image>");
  process.exit(2);
}
const RENDERS = Number(process.env.MEASURE_RENDERS || 200);
// The API's default `MAP_RENDERER_TIMEOUT`, which a full queue has to finish
// inside, and the queue it never shrinks below while that holds.
const DEADLINE_MS = 90_000;
const QUEUE_FLOOR = 24;
const LIMITS = ["--cpus=0.5", "--memory=512m"];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = "https://tiles.openfreemap.org";
const RENDERER = ["node", "map-renderer/index.mjs"];
// The vendored styles' TileJSON, its vector tiles, the Natural Earth underlay and
// the glyph ranges.
const OPENFREEMAP_PATHS =
  /^\/(planet(\/[\w-]+\/\d+\/\d+\/\d+\.pbf)?|natural_earth\/ne2sr\/\d+\/\d+\/\d+\.png|fonts\/[\w%,.-]+\/\d+-\d+\.pbf)$/;

// Quiet on failure: a process listed in `/proc` can be gone by the time it is
// read, and the error says so in the exception rather than on the terminal.
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const containers = [];

process.on("exit", () => {
  for (const name of containers) {
    try {
      docker("rm", "-f", name);
    } catch {
      // Already gone.
    }
  }
});

async function start(name, args, command = []) {
  containers.push(name);
  docker(
    "run",
    "-d",
    "--name",
    name,
    "-p",
    "127.0.0.1::3000",
    "--add-host=host.docker.internal:host-gateway",
    ...LIMITS,
    ...args,
    IMAGE,
    ...command,
  );
  const port = docker("port", name, "3000/tcp").split("\n")[0].split(":").pop();
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) return base;
    } catch {
      // Not listening yet.
    }
    await sleep(1000);
  }
  throw new Error(`${name} never became healthy:\n${docker("logs", name)}`);
}

function stop(name) {
  docker("rm", "-f", name);
  containers.splice(containers.indexOf(name), 1);
}

// What the container's cgroup holds - which counts Xvfb beside Node, as
// Render's memory figure does - and each process's own resident set.
function memory(name) {
  const read = (file) => docker("exec", name, "cat", file);
  const stat = Object.fromEntries(
    read("/sys/fs/cgroup/memory.stat")
      .split("\n")
      .map((line) => line.split(" "))
      .map(([key, value]) => [key, Number(value)]),
  );
  let peak;
  try {
    peak = Number(read("/sys/fs/cgroup/memory.peak"));
  } catch {
    // Older kernels keep no peak.
  }
  const rss = {};
  for (const pid of docker("exec", name, "ls", "/proc")
    .split("\n")
    .filter((entry) => /^\d+$/.test(entry))) {
    try {
      const status = read(`/proc/${pid}/status`);
      const command = status.match(/^Name:\s+(.+)$/m)?.[1];
      const kb = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0);
      if (kb > 0 && command !== "cat")
        rss[command] = (rss[command] ?? 0) + kb * 1024;
    } catch {
      // The process ended between the listing and the read.
    }
  }
  return {
    current: Number(read("/sys/fs/cgroup/memory.current")),
    anon: stat.anon,
    file: stat.file,
    peak,
    rss,
  };
}

const mb = (bytes) =>
  bytes === undefined ? "-" : `${(bytes / 2 ** 20).toFixed(0)} MB`;
const seconds = (ms) => `${(ms / 1000).toFixed(2)} s`;

async function render(base, body) {
  const started = performance.now();
  const response = await fetch(`${base}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const bytes = (await response.arrayBuffer()).byteLength;
  if (response.status !== 200) {
    throw new Error(`POST /render answered ${response.status}`);
  }
  return { ms: performance.now() - started, bytes };
}

// The tile of the grid holding a place at a zoom, as the web names it.
const tileAt = (theme, z, latitude, longitude) => {
  const tiles = 2 ** z;
  const sin = Math.sin((latitude * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return {
    kind: "tile",
    theme,
    z,
    x: Math.min(tiles - 1, Math.floor(((longitude + 180) / 360) * tiles)),
    y: Math.min(tiles - 1, Math.max(0, Math.floor(y * tiles))),
  };
};

// Tiles nobody else's run has warmed, across the zooms a page asks for: a dive
// card's at the deepest, a coast and a country a trip opens on, an ocean
// between islands, and the whole world.
const COLD = [
  tileAt("light", 9, 28.5721, 34.5372),
  tileAt("light", 9, 20.3285, -87.0277),
  tileAt("dark", 9, -8.5503, 119.4891),
  tileAt("light", 6, 26.82, 30.8),
  tileAt("dark", 4, -16, -176.7),
  tileAt("light", 2, 20, 0),
  tileAt("dark", 0, 0, 0),
];
const RECORDED = [
  tileAt("light", 9, 28.5721, 34.5372),
  tileAt("dark", 9, 28.5721, 34.5372),
  tileAt("light", 9, 27.2579, 33.8116),
  tileAt("light", 6, 27, 34),
  tileAt("light", 3, 30, 30),
  tileAt("light", 0, 0, 0),
];

// ---- A recording proxy for OpenFreeMap, and the styles pointed at it ----

function proxy() {
  const recorded = new Map();
  let replaying = false;
  let upstreamRequests = 0;
  const refused = new Set();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://proxy");
    const base = `http://host.docker.internal:${server.address().port}`;
    const send = (status, body, type) => {
      response.writeHead(status, type ? { "Content-Type": type } : {});
      response.end(body);
    };

    if (url.pathname.startsWith("/styles/")) {
      const style = JSON.parse(
        readFileSync(
          path.join(ROOT, "public/basemap", path.basename(url.pathname)),
        ),
      );
      const text = JSON.stringify({ ...style, sprite: `${base}/sprite/ofm` });
      return send(
        200,
        text.replaceAll(UPSTREAM, `${base}/ofm`),
        "application/json",
      );
    }
    if (url.pathname.startsWith("/sprite/")) {
      return send(
        200,
        readFileSync(
          path.join(ROOT, "public/basemap/sprite", path.basename(url.pathname)),
        ),
      );
    }
    if (!url.pathname.startsWith("/ofm/")) return send(404, "");

    // Only what the vendored styles ask OpenFreeMap for, so the proxy can be made
    // to fetch nothing else from it, and nothing at all from anywhere else.
    const key = url.pathname.slice("/ofm".length);
    if (!OPENFREEMAP_PATHS.test(key)) {
      refused.add(key);
      return send(404, "");
    }
    let entry = recorded.get(key);
    if (!entry && replaying) entry = standIn(recorded, key);
    if (!entry && !replaying) {
      const target = new URL(key, UPSTREAM);
      if (target.origin !== UPSTREAM) return send(404, "");
      upstreamRequests += 1;
      const upstream = await fetch(target);
      let body = Buffer.from(await upstream.arrayBuffer());
      const type = upstream.headers.get("content-type") ?? "";
      if (type.includes("json")) {
        body = Buffer.from(
          body.toString("utf8").replaceAll(UPSTREAM, `${base}/ofm`),
        );
      }
      entry = { status: upstream.status, body, type };
      recorded.set(key, entry);
    }
    if (!entry) return send(404, "");
    send(entry.status, entry.body, entry.type);
  });
  return {
    server,
    replay: () => (replaying = true),
    stats: () => ({ recorded: recorded.size, upstreamRequests, refused }),
    listen: () =>
      new Promise((done) =>
        server.listen(0, "0.0.0.0", () => done(server.address().port)),
      ),
  };
}

// A recorded answer standing in for one that was not recorded: a tile of the
// same zoom, picked by its coordinates so the same request gets the same one,
// or a glyph range of the same font.
function standIn(recorded, key) {
  const tile = key.match(/^(.*\/)(\d+)\/(\d+)\/(\d+)(\.\w+)$/);
  if (tile) {
    const [, prefix, z, x, y, extension] = tile;
    const same = [...recorded.keys()].filter((candidate) => {
      const match = candidate.match(/^(.*\/)(\d+)\/\d+\/\d+(\.\w+)$/);
      return (
        match && match[1] === prefix && match[3] === extension && match[2] === z
      );
    });
    const nearest =
      same.length > 0
        ? same
        : [...recorded.keys()].filter(
            (candidate) =>
              candidate.startsWith(prefix) && candidate.endsWith(extension),
          );
    if (nearest.length === 0) return undefined;
    return recorded.get(nearest[(Number(x) * 31 + Number(y)) % nearest.length]);
  }
  const font = key.match(/^(\/fonts\/[^/]+\/)/);
  if (font) {
    const ranges = [...recorded.keys()].filter((candidate) =>
      candidate.startsWith(font[1]),
    );
    return ranges.length ? recorded.get(ranges[0]) : undefined;
  }
  return undefined;
}

// Distinct tiles, from a fixed seed so every run asks for the same ones: most
// at the deepest zoom, as the cards that open on a lone place ask, and the rest
// shallower, as trips and wide dives do.
function* tiles(count) {
  let seed = 20261001;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  for (let index = 0; index < count; index += 1) {
    const theme = index % 2 ? "dark" : "light";
    const latitude = -60 + random() * 120;
    const longitude = -180 + random() * 360;
    const kind = random();
    const z =
      kind < 0.7
        ? 9
        : kind < 0.9
          ? 5 + Math.floor(random() * 4)
          : Math.floor(random() * 5);
    yield tileAt(theme, z, latitude, longitude);
  }
}

const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const range = (values) =>
  `${seconds(Math.min(...values))} – ${seconds(Math.max(...values))}, median ${seconds(median(values))}`;

// ---- The run ----

const lines = [];
const say = (line = "") => lines.push(line);

const platform = docker(
  "image",
  "inspect",
  "-f",
  "{{.Os}}/{{.Architecture}}",
  IMAGE,
);
say(
  `## Map renderer measurements (${platform}, each container at ${LIMITS.join(" ")})`,
);
say();

// Draw times against the real default basemap.
const cold = await start("measure-cold", [], RENDERER);
const coldTimes = [];
for (const body of COLD) coldTimes.push(await render(cold, body));
const warmTimes = [];
for (const body of COLD) warmTimes.push(await render(cold, body));
stop("measure-cold");
const name = ({ theme, z, x, y }) => `${theme} ${z}/${x}/${y}`;
const slowest = Math.max(...coldTimes.map(({ ms }) => ms));
// The most draws the deadline covers at the slowest cold tile, counted with
// the one being drawn - never below the floor unless the floor would pass it.
const covered = Math.floor(DEADLINE_MS / slowest);
const queue =
  QUEUE_FLOOR * slowest <= DEADLINE_MS
    ? Math.max(QUEUE_FLOOR, covered)
    : covered;
say(
  `**Tile times**, ${COLD.length} tiles, fetching from OpenFreeMap over the network:`,
);
say();
say(
  `- cold: ${range(coldTimes.map(({ ms }) => ms))} (each: ${coldTimes.map(({ ms }, index) => `${name(COLD[index])} ${seconds(ms)}`).join(", ")})`,
);
say(`- warm, the same tiles again: ${range(warmTimes.map(({ ms }) => ms))}`);
say(
  `- WebP sizes: ${coldTimes.map(({ bytes }) => `${Math.round(bytes / 1024)} KB`).join(", ")}`,
);
say(
  `- the queue a ${seconds(DEADLINE_MS)} deadline covers at the slowest cold tile: ${queue} (${queue} x ${seconds(slowest)} = ${seconds(queue * slowest)})`,
);
say();

// Memory, from a recording.
const recorder = proxy();
const proxyPort = await recorder.listen();
const proxied = [
  "-e",
  `MAP_STYLE_URL=http://host.docker.internal:${proxyPort}/styles/liberty.json`,
  "-e",
  `MAP_STYLE_URL_DARK=http://host.docker.internal:${proxyPort}/styles/dark.json`,
  "-e",
  "MAP_ATTRIBUTION=OpenFreeMap, recorded",
];
const recording = await start("measure-record", proxied, RENDERER);
for (const body of RECORDED) await render(recording, body);
stop("measure-record");
recorder.replay();

const renderer = await start("measure-memory", proxied, RENDERER);
const idle = memory("measure-memory");
const samples = [];
const memoryTimes = [];
let drawn = 0;
for (const body of tiles(RENDERS)) {
  memoryTimes.push((await render(renderer, body)).ms);
  drawn += 1;
  if (drawn % 25 === 0 || drawn === RENDERS)
    samples.push([drawn, memory("measure-memory")]);
}
await sleep(30_000);
const settled = memory("measure-memory");
stop("measure-memory");
recorder.server.close();

const { recorded, upstreamRequests, refused } = recorder.stats();
if (refused.size > 0) {
  console.error(`The proxy refused: ${[...refused].join(", ")}`);
}
say(
  `**The renderer's memory** over ${RENDERS} distinct tiles, served from ` +
    `${recorded} responses recorded from ${upstreamRequests} requests to OpenFreeMap ` +
    `(${RECORDED.length} tiles), each tile ${range(memoryTimes)}:`,
);
say();
say("| after | cgroup | anon | file | node | Xvfb |");
say("| --- | --- | --- | --- | --- | --- |");
const row = (label, sample) =>
  say(
    `| ${label} | ${mb(sample.current)} | ${mb(sample.anon)} | ${mb(sample.file)} | ` +
      `${mb(sample.rss.MainThread ?? sample.rss.node)} | ${mb(sample.rss.Xvfb)} |`,
  );
row("start", idle);
for (const [count, sample] of samples) row(`${count} tiles`, sample);
row("30 s idle", settled);
say();
say(
  `Peak: ${mb(settled.peak)}. Render's 80 % trigger on 512 MB is ${mb(0.8 * 512 * 2 ** 20)}.`,
);
say();

// The web server, on the same base and under the same limits.
const web = await start("measure-web", []);
for (let round = 0; round < 10; round += 1) {
  for (const page of [
    "/",
    "/signin",
    "/dives",
    "/trips",
    "/privacy",
    "/support",
  ]) {
    await (await fetch(`${web}${page}`)).arrayBuffer();
  }
}
await sleep(10_000);
const webMemory = memory("measure-web");
stop("measure-web");
say(
  `**The web server** after 60 page loads: node ${mb(webMemory.rss.MainThread ?? webMemory.rss["next-server"] ?? Object.values(webMemory.rss)[0])} RSS, cgroup ${mb(webMemory.current)}.`,
);
say();

// The image.
const size = Number(docker("image", "inspect", "-f", "{{.Size}}", IMAGE));
let compressed;
try {
  const manifest = JSON.parse(
    docker("buildx", "imagetools", "inspect", "--raw", IMAGE),
  );
  compressed = manifest.layers?.reduce((sum, layer) => sum + layer.size, 0);
} catch {
  // Not in a registry.
}
say(
  `**The image**: ${mb(size)} unpacked${compressed ? `, ${mb(compressed)} compressed` : ""}.`,
);

console.log(lines.join("\n"));
