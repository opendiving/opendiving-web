// The map tiles a page has fetched, kept for the page's lifetime so a card
// scrolled away and back, or a list returned to, shows its map at once, and the
// requests for the rest - at most `MAX_TILE_REQUESTS` at a time, the others
// queued in the order their maps asked, and one request per tile however many
// maps on the page show it.
//
// The cap is for the connections. A tile the API has not drawn yet is drawn
// while its request waits, and over HTTP/1.1 - a plain-HTTP LAN install among
// the ways an instance is served - a browser opens six connections to a host
// across all its tabs. A card needs up to six tiles, so two at a time would
// draw a single card in three turns; four leaves two connections for the rest
// of the page, though none for a second tab that is drawing too.

// Every tile of the maps near the screen many times over, and bounded, so a long
// scroll through a list does not keep every coast it passed.
const MAX_TILES = 200;
export const MAX_TILE_REQUESTS = 4;

// Keyed by the request URL, which names the tile's theme and square, so a
// switched theme is a miss rather than the other theme's tile. Bounded, the
// least recently shown out first, and an object URL dropped is revoked: the
// document holds its bytes until it is.
const tiles = new Map<string, string>();

type Settle = (url: string | null) => void;

interface Request {
  key: string;
  load: (signal: AbortSignal) => Promise<Blob>;
  controller: AbortController;
  // The maps waiting on it. A request nobody waits on any more is let go.
  waiters: Set<Settle>;
  started: boolean;
}

const requests = new Map<string, Request>();
const queue: Request[] = [];
let inFlight = 0;

/**
 * The tile at `key` if the page holds it, as an object URL. Asking counts as
 * showing it, so the tiles a map on screen keeps asking for are the last the
 * bound lets go of.
 */
export function findTile(key: string): string | undefined {
  const url = tiles.get(key);
  if (url !== undefined) {
    tiles.delete(key);
    tiles.set(key, url);
  }
  return url;
}

function remember(key: string, url: string) {
  const replaced = tiles.get(key);
  tiles.delete(key);
  tiles.set(key, url);
  if (replaced) URL.revokeObjectURL(replaced);
  if (tiles.size <= MAX_TILES) return;
  const [oldestKey, oldest] = tiles.entries().next().value!;
  tiles.delete(oldestKey);
  URL.revokeObjectURL(oldest);
}

function pump() {
  while (inFlight < MAX_TILE_REQUESTS && queue.length > 0) {
    start(queue.shift()!);
  }
}

function start(request: Request) {
  request.started = true;
  inFlight += 1;
  request.load(request.controller.signal).then(
    // Kept even when every map waiting on it has gone: the bytes are here, and
    // the next map to ask is shown them at once.
    (blob) => {
      const url = URL.createObjectURL(blob);
      remember(request.key, url);
      finish(request, url);
    },
    // A failure is not kept: the map that asks next asks the API again.
    () => finish(request, null),
  );
}

function finish(request: Request, url: string | null) {
  inFlight -= 1;
  if (requests.get(request.key) === request) requests.delete(request.key);
  for (const settle of request.waiters) settle(url);
  pump();
}

/**
 * Ask for a tile, which `settle` is handed as an object URL - or as `null`
 * when it could not be had, which a map shows as water.
 *
 * Returns the map's way of withdrawing: a request its last map withdraws from
 * is aborted if it has started, and dropped from the queue if it has not.
 */
export function requestTile(
  key: string,
  load: (signal: AbortSignal) => Promise<Blob>,
  settle: Settle,
): () => void {
  let request = requests.get(key);
  if (!request) {
    request = {
      key,
      load,
      controller: new AbortController(),
      waiters: new Set(),
      started: false,
    };
    requests.set(key, request);
    queue.push(request);
  }
  const asked = request;
  asked.waiters.add(settle);
  pump();

  return () => {
    if (!asked.waiters.delete(settle) || asked.waiters.size > 0) return;
    if (requests.get(key) === asked) requests.delete(key);
    if (asked.started) {
      asked.controller.abort();
    } else {
      queue.splice(queue.indexOf(asked), 1);
    }
  };
}
