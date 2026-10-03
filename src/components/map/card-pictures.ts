// The map pictures a page's cards have fetched, kept for the page's lifetime so
// a card scrolled away and back shows its picture at once, and the requests for
// the rest - at most `MAX_PICTURE_REQUESTS` at a time, the others queued in the
// order their cards asked.
//
// The cap is for the connections. A picture the API has not drawn yet is drawn
// while its request waits, and over HTTP/1.1 - a plain-HTTP LAN install among
// the ways an instance is served - a browser opens six connections to a host
// across all its tabs. Two per page leaves the rest of the page, and a second
// tab drawing too, room to load.

const MAX_PICTURES = 100;
export const MAX_PICTURE_REQUESTS = 2;

// Keyed by the request URL, whose digest changes whenever the picture would, so
// a moved place or a switched theme is a miss rather than a stale picture.
// Bounded, oldest first out, and an object URL dropped is revoked: the document
// holds its bytes until it is.
const pictures = new Map<string, string>();

type Settle = (url: string | null) => void;

interface Request {
  key: string;
  load: (signal: AbortSignal) => Promise<Blob>;
  controller: AbortController;
  // The cards waiting on it. A request nobody waits on any more is let go.
  waiters: Set<Settle>;
  started: boolean;
}

const requests = new Map<string, Request>();
const queue: Request[] = [];
let inFlight = 0;

export function findCardPicture(key: string): string | undefined {
  return pictures.get(key);
}

function remember(key: string, url: string) {
  const replaced = pictures.get(key);
  pictures.delete(key);
  pictures.set(key, url);
  if (replaced) URL.revokeObjectURL(replaced);
  if (pictures.size <= MAX_PICTURES) return;
  const [oldestKey, oldest] = pictures.entries().next().value!;
  pictures.delete(oldestKey);
  URL.revokeObjectURL(oldest);
}

function pump() {
  while (inFlight < MAX_PICTURE_REQUESTS && queue.length > 0) {
    start(queue.shift()!);
  }
}

function start(request: Request) {
  request.started = true;
  inFlight += 1;
  request.load(request.controller.signal).then(
    // Kept even when every card waiting on it has gone: the bytes are here,
    // and the next card to ask is shown them at once.
    (blob) => {
      const url = URL.createObjectURL(blob);
      remember(request.key, url);
      finish(request, url);
    },
    // A failure is not kept: the card that asks next asks the API again.
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
 * Ask for a card's picture, which `settle` is handed as an object URL - or as
 * `null` when it could not be had, which a card shows as water.
 *
 * Returns the card's way of withdrawing: a request its last card withdraws from
 * is aborted if it has started, and dropped from the queue if it has not.
 */
export function requestCardPicture(
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
