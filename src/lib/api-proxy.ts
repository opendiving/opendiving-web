import { NextRequest } from "next/server";

/**
 * The same-origin API proxy: everything the browser sends to `/api/v1/...` is streamed
 * through to the API container and its response streamed back.
 *
 * This is what makes a prebuilt web image work on any domain with no rebuild. The
 * browser only ever talks to the origin that served the page (`lib/api-base.ts`), so
 * there is no cross-site request to configure CORS for, no cross-site cookie to lose to
 * `SameSite=Lax`, and no API address baked into the client bundle. The one address that
 * does have to be known - the API container's - is read from `process.env` *per request*
 * here, which is why this is a route handler rather than a `rewrites()` entry: rewrites
 * are serialized into the build output and a prebuilt image would carry whatever the
 * builder happened to have set.
 *
 * See `DECISIONS.md`, "The web app proxies `/api/v1` to the API, and that is the
 * shipped topology".
 */

const DEFAULT_INTERNAL_URL = "http://api:8000";
const DEFAULT_DEV_INTERNAL_URL = "http://localhost:8000";

// Per RFC 9110 these describe a single transport connection, so forwarding them onto the
// next one is meaningless at best and a framing bug at worst - `transfer-encoding` in
// particular, since the hop this proxy opens does its own chunking. `trailer` is the
// spelling in the RFC; `trailers` is the one the older RFC 2616 list used and is still
// sent by some clients.
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

// Dropped from the *request* on top of the hop-by-hop set.
const REQUEST_ONLY_DROPS = new Set([
  // Names the origin the browser asked for, which is not the one being dialled. Left in
  // place it would reach the API as its `Host`, and any absolute URL the API builds from
  // it - or any host-based routing in front of it - would be wrong.
  "host",
  // `fetch` recomputes framing for the hop it opens. A forwarded length is either
  // redundant or, once the body is a stream, a lie.
  "content-length",
  // Never forwarded verbatim: `fetch` negotiates its own encoding for the hop it opens
  // and decodes the reply transparently, so the browser's list is the wrong one to send -
  // advertising a codec `fetch` cannot decode would leave a compressed body paired with a
  // `content-encoding` this proxy then has to strip (see `downstreamHeaders`), which is
  // corruption rather than a wrong header. `fetch` substitutes its own `accept-encoding`.
  "accept-encoding",
  // A `100-continue` negotiation with *this* server, which Node has already answered by
  // the time a handler runs. Forwarded, it reaches `fetch` as an unsupported header and
  // the whole request fails with `UND_ERR_NOT_SUPPORTED` - a 502 for every large upload
  // from curl or any other client that asks first. Browsers never send it, which is
  // exactly why this would have gone unnoticed.
  "expect",
]);

/**
 * The API container's address, read at request time.
 *
 * `API_INTERNAL_URL` is an *origin* - `http://api:8000`, no `/api/v1` - because the
 * request's own path is appended to it unchanged. The default is the compose service
 * name, so the shipped bundle needs no configuration at all; under `next dev` it is
 * `localhost:8000`, where the API's own compose file publishes it.
 */
export function resolveApiInternalUrl(
  env: { API_INTERNAL_URL?: string; NODE_ENV?: string } = process.env,
): string {
  const configured = env.API_INTERNAL_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return env.NODE_ENV === "production"
    ? DEFAULT_INTERNAL_URL
    : DEFAULT_DEV_INTERNAL_URL;
}

// Everything named in `Connection` is hop-by-hop too, by definition - that header is how
// a peer declares its own additions to the list.
function connectionScopedHeaders(headers: Headers): Set<string> {
  const declared = headers.get("connection");
  if (!declared) return new Set();
  return new Set(
    declared
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );
}

function upstreamHeaders(request: NextRequest): Headers {
  const perConnection = connectionScopedHeaders(request.headers);
  const headers = new Headers();

  for (const [name, value] of request.headers) {
    if (HOP_BY_HOP_HEADERS.has(name)) continue;
    if (REQUEST_ONLY_DROPS.has(name)) continue;
    if (perConnection.has(name)) continue;
    headers.set(name, value);
  }

  // The forwarding chain the API's `client_ip()` walks to key its ten per-IP rate limits.
  // It arrives already assembled: Next fills `x-forwarded-for` from the socket peer and
  // `x-forwarded-proto` from the connection when they are absent, and leaves whatever a
  // proxy in front set when they are not - so the loop above has copied both across, and
  // that is the whole job. It is not optional. Drop them and every caller reaches the API
  // as this one container, collapsing all ten buckets into one, which is exactly the
  // failure the API's `TRUSTED_PROXY_IPS` exists to prevent. That variable is still what
  // decides whether the API believes the chain, and it has to name *this* container (the
  // API's peer), not the operator's own proxy, which the API never talks to directly. An
  // install that omits it gets one shared bucket rather than a forgeable one.
  //
  // `x-forwarded-for` has no fallback here because there is nothing to fall back to: a
  // route handler cannot see the socket peer (`NextRequest.ip` was removed in Next 15),
  // so Next's own normalization is the only source for it. Proto and host can be
  // reconstructed from the request URL, which is what the two lines below do for a caller
  // that reached this function without them - a unit test today.
  if (!headers.has("x-forwarded-proto")) {
    headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));
  }
  if (!headers.has("x-forwarded-host")) {
    headers.set("x-forwarded-host", request.nextUrl.host);
  }

  return headers;
}

function downstreamHeaders(upstream: Response): Headers {
  const perConnection = connectionScopedHeaders(upstream.headers);
  // `fetch` decodes a compressed body transparently but leaves the header describing it
  // in place, so forwarding the pair would tell the browser to decode plain bytes - and
  // `content-length` with it, being the compressed length of a body that no longer is.
  // This is the common path, not a defensive one: `fetch` substitutes its own
  // `accept-encoding: gzip, deflate` for the one dropped above, so any API that
  // compresses at all comes back through here.
  const decoded = upstream.headers.has("content-encoding");
  const headers = new Headers();

  for (const [name, value] of upstream.headers) {
    if (HOP_BY_HOP_HEADERS.has(name)) continue;
    if (perConnection.has(name)) continue;
    if (decoded && (name === "content-encoding" || name === "content-length"))
      continue;
    // Merged into one comma-joined value by this loop, which is wrong for cookies -
    // `Expires` contains a comma. Re-added individually below.
    if (name === "set-cookie") continue;
    headers.set(name, value);
  }

  // The refresh-token cookie is the reason this proxy has to exist as more than a URL
  // rewrite: it is httpOnly, and it has to reach the browser as if the API had set it.
  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }

  return headers;
}

/**
 * Streams one request through to the API and its response back.
 *
 * Nothing is buffered in either direction: the 10 MB dive-file and certification-card
 * uploads go up as a stream and the export archive comes down as one. That holds because
 * `src/proxy.ts`'s matcher excludes `api/` - a request that reaches middleware has its
 * body cloned into memory first, capped at Next's 10 MB default, and silently truncated
 * past it.
 *
 * Exported for `route.ts`, which binds it to every method. Route files may only export
 * handlers and segment config, so the wiring lives there and the logic lives here.
 */
export async function proxyToApi(request: NextRequest): Promise<Response> {
  // The raw URL rather than the resolved `params`: catch-all params arrive
  // percent-decoded, so re-joining them would mangle any segment containing an encoded
  // slash or space on the way back out.
  const { pathname, search } = new URL(request.url);
  const base = resolveApiInternalUrl();
  const target = `${base}${pathname}${search}`;

  // GET and HEAD carry no body; anything else streams whatever the browser sent.
  const body =
    request.method === "GET" || request.method === "HEAD" ? null : request.body;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: upstreamHeaders(request),
      body,
      // `fetch` refuses a stream body without it. Not in the DOM lib's `RequestInit`,
      // which is what the cast below is for.
      ...(body ? { duplex: "half" } : {}),
      // A redirect is the API's answer to the browser, not an instruction to this proxy.
      redirect: "manual",
      // Next patches `fetch` with its own caching layer; an API proxy must never serve a
      // second caller from the first one's response.
      cache: "no-store",
      // A closed browser connection cancels the upstream request rather than leaving it
      // to run to completion against the API.
      signal: request.signal,
    } as RequestInit);
  } catch (error) {
    // The API being down, unresolvable, or still starting. Shaped like FastAPI's own
    // error body so `getApiErrorMessage` finds a message rather than its generic
    // fallback, and logged with the route so the cause is one line away.
    //
    // The path only, never the query string: `?token=...` on the two magic-link precheck
    // routes (`auth/email/verify/check`, `user/email-change/verify/check`) is a live,
    // single-use sign-in credential, and this branch is exactly the case where the check
    // never reached the API - so the token is still valid when it lands in the log. The
    // API refuses to log those for the same reason.
    console.error(
      `[api-proxy] ${request.method} ${base}${pathname} failed:`,
      error,
    );
    return Response.json(
      { detail: "The API is unreachable. Check that it is running." },
      { status: 502 },
    );
  }

  // A body is forbidden on these, and constructing a `Response` with one throws.
  const bodyless =
    request.method === "HEAD" ||
    upstream.status === 204 ||
    upstream.status === 205 ||
    upstream.status === 304;

  return new Response(bodyless ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: downstreamHeaders(upstream),
  });
}
