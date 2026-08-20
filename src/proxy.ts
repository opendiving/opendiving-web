import { NextRequest, NextResponse } from "next/server";
import { apiCspSource } from "@/lib/api-base";
import { tileOrigins } from "@/lib/map-tiles";
import { runtimeConfig } from "@/lib/runtime-config";

// Nonce-based, strict Content-Security-Policy. This is computed fresh per
// request (the nonce must never be reused/predictable) and threaded through
// to Server Components via the `x-nonce` request header, so
// `app/layout.tsx` can hand it to anything that legitimately needs to
// render an inline <script>/<style> (currently just next-themes'
// no-flash-of-wrong-theme bootstrap script). Any *other* inline or
// injected script - e.g. one smuggled in via an XSS bug - won't carry this
// nonce and the browser will simply refuse to execute it.
//
// This only works because the app runs as a persistent Node server
// (`output: "standalone"`, see the Dockerfile) - it would silently do
// nothing under a static export, which has no per-request server code to
// generate a fresh nonce.
// Empty by default, and that is the shipped topology: the API is same-origin behind
// `app/api/v1/[...path]/route.ts`, which `'self'` already covers. It becomes a real
// origin only for a split-origin build, where `NEXT_PUBLIC_API_URL` is absolute - and
// that one genuinely is fixed at build time, which is why it is read here at module
// scope while everything below is not.
const API_ORIGIN_SOURCE = apiCspSource(process.env.NEXT_PUBLIC_API_URL) ?? "";

// The host sources the configuration decides on, each empty when the feature behind it
// is off. Derived on first request rather than at module load - reading the environment
// while the module is being evaluated risks doing it at build time, and the whole point
// of `lib/runtime-config.ts` is that a published image reads it in the container it runs
// in. Derived *once* rather than per request for the reason it always was: the
// environment cannot change while the process lives, and `tileOrigins`' warning for a
// malformed template would otherwise repeat on every request, burying the one diagnostic
// it exists to give.
interface ConfiguredCspSources {
  tiles: string;
  gravatar: string;
  google: string;
}

let configuredSources: ConfiguredCspSources | undefined;

function cspSources(): ConfiguredCspSources {
  if (!configuredSources) {
    const { gravatarEnabled, googleClientId, tiles } = runtimeConfig();
    configuredSources = {
      tiles: tileOrigins(tiles).join(" "),
      // `UserAvatar` only reaches for Gravatar when the instance turned it on, so
      // naming the host unconditionally would advertise a third party this deployment
      // never contacts - and leave the allowance in place for anything else that tried.
      gravatar: gravatarEnabled ? "https://www.gravatar.com" : "",
      // Same reasoning for Google: with no client ID the button never renders, GSI's
      // script is never loaded, and none of the three directives below has anything to
      // allow.
      google: googleClientId ? "https://accounts.google.com" : "",
    };
  }
  return configuredSources;
}

// `Strict-Transport-Security` is set here rather than in `next.config.js`'s `headers()`
// for two reasons that only middleware can serve: the value depends on the request, and
// the switch behind it is read at runtime. `headers()` is evaluated once, during the
// build, and applied to every response of every deployment identically - which for a
// published image means the build machine decides it for someone else's domain.
//
// What it now respects. It is only sent for a request that already arrived over HTTPS: a
// LAN instance on plain HTTP would otherwise hand out a pin it cannot honour, and a
// browser that recorded one stops being able to reach it at all. And it no longer carries
// `preload` - entering a domain into the browsers' preload list commits every host under
// it to HTTPS for years and is deliberately hard to undo, which is a decision for whoever
// owns the domain rather than for the app running on it. `WEB_HSTS=off` drops the header
// entirely.
//
// Only responses the matcher below covers get it, which is documents and their data
// requests rather than static assets. HSTS is recorded per *host*, not per path, so one
// covered response is all a browser needs.
const HSTS_VALUE = "max-age=63072000; includeSubDomains";

// Whether this request reached us over HTTPS. Behind the shipped Caddy - or any other
// proxy - TLS is terminated a hop earlier and the only evidence is the forwarded header;
// a chain appends to it, so the client-facing hop is the first entry, not the last.
function isHttps(request: NextRequest): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim().toLowerCase() === "https";
  }
  return request.nextUrl.protocol === "https:";
}

// A directive and its sources, with the empty ones dropped. Every source below the
// literal ones can vanish - the API origin whenever the API is same-origin, the tile
// origins when every configured template is malformed, Gravatar and Google when the
// instance has not turned them on - and a stray double space in a CSP is the kind of
// thing that reads as a typo forever after.
function cspList(directive: string, ...sources: string[]): string {
  return [directive, ...sources.filter(Boolean)].join(" ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  // Empty string for the default, same-origin API - see `API_ORIGIN_SOURCE` above.
  // `lib/api-base.ts` is what reduces an absolute value to an origin and what knows a
  // relative one can't go through `new URL` at all.
  const apiOrigin = API_ORIGIN_SOURCE;
  // `tiles` is the map picker's raster tiles, and the *only* thing the map needs
  // from CSP - which is the whole reason it is hand-rolled rather than MapLibre,
  // whose web worker would have forced `worker-src blob:` into a strict nonce
  // policy. Derived by the same module that builds the tile URLs
  // (`lib/map-tiles.ts`) for the same origin-not-path reason as above: a host
  // named in one place and not the other fails as a silently blocked image,
  // which is a much worse thing to debug than a wrong URL. `gravatar` and
  // `google` are empty unless this instance turned those features on.
  const {
    tiles: tileOriginSources,
    gravatar: gravatarSource,
    google: googleSource,
  } = cspSources();

  const cspDirectives = [
    "default-src 'self'",
    // `'unsafe-inline'` and `https:` are no-ops in any browser that
    // understands `'nonce-...'`/`'strict-dynamic'` (CSP Level 3) - such
    // browsers ignore them - but keep the site from breaking outright in
    // older browsers that don't. This is the "strict CSP with graceful
    // fallback" pattern from Google's CSP guide, not a real weakening.
    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    // `style-src` (governs `<style>`/`<link>` elements) is nonce-gated in
    // production only. In dev, Next's own tooling - Fast Refresh, the
    // dev/error overlay, and webpack/Turbopack's CSS hot-injection - injects
    // inline `<style>` tags with no nonce at all (a documented Next.js
    // limitation, e.g. vercel/next.js#87343), so a strict nonce here just
    // breaks dev-mode styling. Production doesn't do any of that: real CSS
    // ships as static, hashed `<link rel="stylesheet">` files (covered by
    // `'self'`), so the nonce requirement costs nothing there.
    // `style-src-attr` is deliberately its own, non-nonce'd directive: per
    // spec, listing a nonce/hash in a directive disables the `'unsafe-inline'`
    // fallback for *that* directive, and inline `style="..."` attributes from
    // Radix/Floating UI/etc. (positioning, `pointer-events`, animation state)
    // can't practically carry a matching nonce - there's no way to tag every
    // element a third-party library renders. CSS-attribute injection can't
    // execute script in any modern browser, so this is a deliberate, narrow
    // relaxation - `style-src-elem`/`style-src` (actual `<style>` blocks,
    // where CSS-exfiltration attacks are more feasible) remain nonce-only
    // in production.
    // `accounts.google.com` - GSI's client script injects its own
    // `<link rel="stylesheet" href="https://accounts.google.com/gsi/style">`
    // into `<head>`. A host source is needed even in dev: `'unsafe-inline'`
    // only covers inline `<style>`, never an external stylesheet. Without it
    // the real (invisible but click-receiving) Google button renders unstyled.
    isDev
      ? cspList("style-src", "'self'", "'unsafe-inline'", googleSource)
      : cspList("style-src", "'self'", `'nonce-${nonce}'`, googleSource),
    "style-src-attr 'unsafe-inline'",
    // `gravatarSource` - `UserAvatar` (`lib/utils.ts`'s `getGravatarUrl`) loads
    // user avatars from there, on the instances that enabled it.
    // `blob:` - certification card images are private, so they're fetched with an
    // `Authorization` header and rendered from an object URL rather than pointed
    // at directly (see `hooks/useAuthedBlobUrl.ts`). Blob URLs are *not* covered
    // by `'self'`, so without this the `<img>` is blocked. It widens nothing an
    // attacker could reach: a `blob:` URL can only name data this document
    // already created.
    cspList(
      "img-src",
      "'self'",
      "data:",
      "blob:",
      apiOrigin,
      gravatarSource,
      tileOriginSources,
    ),
    "font-src 'self' data:",
    // `accounts.google.com` - the "Continue with Google" button
    // (`components/auth/google-auth-button.tsx`) renders Google's own iframe
    // there, and its client-side JS calls it directly to complete sign-in.
    // The script itself (`https://accounts.google.com/gsi/client?hl=en`)
    // doesn't need a dedicated `script-src` entry - it's injected by our own
    // already-trusted bundle, which `'strict-dynamic'` (above) automatically
    // extends trust to.
    cspList("connect-src", "'self'", apiOrigin, googleSource),
    cspList("frame-src", "'self'", googleSource),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  const contentSecurityPolicyHeaderValue = cspDirectives.join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(
    "Content-Security-Policy",
    contentSecurityPolicyHeaderValue,
  );

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(
    "Content-Security-Policy",
    contentSecurityPolicyHeaderValue,
  );

  // `runtimeConfig()` memoizes, so these two are one environment read for the life of
  // the process rather than one per request.
  const { hstsEnabled, noindex } = runtimeConfig();
  if (hstsEnabled && isHttps(request)) {
    // A TLS-terminating proxy in front may set its own; where both are present the
    // proxy's wins, which is the right way round - it is the one that knows the domain.
    response.headers.set("Strict-Transport-Security", HSTS_VALUE);
  }
  if (noindex) {
    // `app/robots.ts` asks crawlers not to fetch; this is what keeps a URL they heard
    // about elsewhere out of an index anyway. A disallowed path can still be listed - a
    // crawler that obeys robots.txt never fetches it and so never sees a `noindex` in the
    // page, which is exactly why the header exists as well.
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: [
    {
      // The exclusions are anchored with a trailing `/` (or `$`) on purpose:
      // an unanchored `api` also excludes any future route that merely *starts*
      // with those letters - `/api-docs`, `/apidemo` - which would then be
      // served with no CSP at all, silently.
      //
      // `healthz` is excluded for the same reason the API routes are: it answers a
      // container healthcheck with two words of plain text, and a policy governing
      // scripts and styles has nothing to say about it. Skipping it also keeps the
      // per-request nonce off a path that is hit every few seconds forever.
      source: "/((?!api/|_next/static/|_next/image/|favicon.ico$|healthz$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
