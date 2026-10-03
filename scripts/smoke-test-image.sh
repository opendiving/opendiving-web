#!/usr/bin/env bash
# Starts both programs in a built image and checks that each does its job:
#
#   - the web server, as the image starts by default, serves a page. A page and
#     not just `/healthz`, which is shallow on purpose and answers 200 from a
#     process whose every page is a 500.
#   - the map renderer, started with its own command, draws a tile on a style
#     that needs no network into a 1024x1024 WebP of that style's background
#     and nothing else, and refuses a malformed body and a zoom past the deepest
#     a map is fitted at.
#
#   scripts/smoke-test-image.sh ghcr.io/opendiving/opendiving-web@sha256:...
#
# Publish Image runs it on each architecture before anything is tagged; it runs
# just as well against a local `docker build`.
set -euo pipefail

IMAGE="${1:?usage: scripts/smoke-test-image.sh <image>}"
WEB="smoke-web-$$"
RENDERER="smoke-renderer-$$"
OUT="$(mktemp -d)"

cleanup() {
  docker rm -f "$WEB" "$RENDERER" >/dev/null 2>&1 || true
  rm -rf "$OUT"
}
trap cleanup EXIT

fail() {
  echo "::error::$1"
  shift
  for container in "$@"; do docker logs "$container" 2>&1 | tail -50; done
  exit 1
}

# Where a container's port 3000 landed on this host.
port_of() {
  docker port "$1" 3000/tcp | head -n 1 | sed 's/.*://'
}

wait_for() {
  local url="$1" container="$2"
  for _ in $(seq 60); do
    if curl -fs -o /dev/null "$url"; then return 0; fi
    if [ "$(docker inspect -f '{{.State.Running}}' "$container")" != "true" ]; then
      fail "$container exited before $url answered" "$container"
    fi
    sleep 1
  done
  fail "$url did not answer within 60 s" "$container"
}

# ---- The web server ----
docker run -d --name "$WEB" -p 127.0.0.1::3000 "$IMAGE" >/dev/null
WEB_URL="http://127.0.0.1:$(port_of "$WEB")"
wait_for "$WEB_URL/healthz" "$WEB"
curl -fsS "$WEB_URL/" -o "$OUT/home.html" || fail "The home page did not load" "$WEB"
grep -q '<title>OpenDiving' "$OUT/home.html" ||
  fail "The home page has no OpenDiving title" "$WEB"
echo "The web server serves the home page."

# ---- The map renderer ----
# A background and nothing else: no tiles, no glyphs, no sprite. Spelled
# `rgb()` because a `#` would end the data: URL.
BACKGROUND="#204060"
STYLE='data:application/json,{"version":8,"sources":{},"layers":[{"id":"background","type":"background","paint":{"background-color":"rgb(32,64,96)"}}]}'
docker run -d --name "$RENDERER" -p 127.0.0.1::3000 \
  -e MAP_STYLE_URL="$STYLE" -e MAP_ATTRIBUTION="Smoke test" \
  "$IMAGE" node map-renderer/index.mjs >/dev/null
RENDERER_URL="http://127.0.0.1:$(port_of "$RENDERER")"
wait_for "$RENDERER_URL/healthz" "$RENDERER"

SIGNATURE="$(curl -fsS "$RENDERER_URL/signature" | sed -E 's/.*"signature":"([^"]*)".*/\1/')"
[[ "$SIGNATURE" =~ ^[0-9a-f]{64}$ ]] || fail "Not a signature: $SIGNATURE" "$RENDERER"

TILE='{"kind":"tile","theme":"light","z":9,"x":305,"y":213}'
STATUS="$(curl -sS -o "$OUT/tile.webp" -D "$OUT/headers" -w '%{http_code}' \
  -H 'Content-Type: application/json' --data "$TILE" "$RENDERER_URL/render")"
[ "$STATUS" = "200" ] || fail "POST /render answered $STATUS" "$RENDERER"
grep -qi '^content-type: image/webp' "$OUT/headers" ||
  fail "POST /render did not answer image/webp" "$RENDERER"
grep -qi "^x-map-signature: $SIGNATURE" "$OUT/headers" ||
  fail "POST /render did not name the signature" "$RENDERER"

for BODY in '{"kind":"tile"}' '{"kind":"tile","theme":"light","z":10,"x":0,"y":0}'; do
  STATUS="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H 'Content-Type: application/json' --data "$BODY" "$RENDERER_URL/render")"
  [ "$STATUS" = "400" ] || fail "$BODY answered $STATUS, not 400" "$RENDERER"
done

# The tile, read with the image's own sharp: its size, and the fixture's colour
# in its corners and its middle - nothing of any record is drawn into a tile.
docker run --rm -i -w /app/map-renderer --entrypoint node \
  -e BACKGROUND="$BACKGROUND" "$IMAGE" -e '
    const sharp = require("sharp");
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", async () => {
      const input = Buffer.concat(chunks);
      const { format, width, height } = await sharp(input).metadata();
      const { data, info } = await sharp(input)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const at = (x, y) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
      const near = (pixel, hex) =>
        pixel.every((value, i) => Math.abs(value - parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16)) <= 8);
      const problems = [];
      if (format !== "webp" || width !== 1024 || height !== 1024) {
        problems.push(`a ${width}x${height} ${format}, not a 1024x1024 webp`);
      }
      for (const [x, y] of [[10, 10], [1013, 10], [10, 1013], [1013, 1013], [512, 512]]) {
        if (!near(at(x, y), process.env.BACKGROUND)) problems.push(`(${x}, ${y}) is ${at(x, y)}`);
      }
      if (problems.length) {
        console.error(problems.join("; "));
        process.exit(1);
      }
    });
  ' <"$OUT/tile.webp" || fail "The renderer drew the wrong tile" "$RENDERER"
echo "The map renderer draws a tile, with signature $SIGNATURE."
