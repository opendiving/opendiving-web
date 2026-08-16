import { NextRequest, NextResponse } from "next/server";
import { tileOrigins } from "@/lib/map-tiles";

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
// Derived once, not per request: `NEXT_PUBLIC_*` is fixed at build time, so the
// answer cannot change while the process lives - and the dev-mode warning for a
// malformed template would otherwise repeat on every request, burying the one
// diagnostic it exists to give.
const TILE_ORIGIN_SOURCES = tileOrigins().join(" ");

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  // CSP source expressions match by *origin*, not by prefix - a source with
  // a path (e.g. `http://localhost:8000/api/v1`) only matches requests to
  // that exact path, not `/api/v1/login` or anything else under it. Since
  // `NEXT_PUBLIC_API_URL` may include a path prefix (it's also used
  // directly as axios' `baseURL` in `lib/api/client.ts`), strip it down to
  // just the origin here.
  const apiOrigin = new URL(
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1",
  ).origin;
  // The map picker's raster tiles, and the *only* thing the map needs from CSP
  // - which is the whole reason it is hand-rolled rather than MapLibre, whose
  // web worker would have forced `worker-src blob:` into a strict nonce policy.
  // Derived by the same module that builds the tile URLs (`lib/map-tiles.ts`)
  // for the same origin-not-path reason as above: a host named in one place and
  // not the other fails as a silently blocked image, which is a much worse
  // thing to debug than a wrong URL.
  const tileOriginSources = TILE_ORIGIN_SOURCES;

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
      ? "style-src 'self' 'unsafe-inline' https://accounts.google.com"
      : `style-src 'self' 'nonce-${nonce}' https://accounts.google.com`,
    "style-src-attr 'unsafe-inline'",
    // `www.gravatar.com` - `UserAvatar` (`lib/utils.ts`'s `getGravatarUrl`)
    // loads user avatars from there.
    // `blob:` - certification card images are private, so they're fetched with an
    // `Authorization` header and rendered from an object URL rather than pointed
    // at directly (see `hooks/useAuthedBlobUrl.ts`). Blob URLs are *not* covered
    // by `'self'`, so without this the `<img>` is blocked. It widens nothing an
    // attacker could reach: a `blob:` URL can only name data this document
    // already created.
    `img-src 'self' data: blob: ${apiOrigin} https://www.gravatar.com ${tileOriginSources}`,
    "font-src 'self' data:",
    // `accounts.google.com` - the "Continue with Google" button
    // (`components/auth/google-auth-button.tsx`) renders Google's own iframe
    // there, and its client-side JS calls it directly to complete sign-in.
    // The script itself (`https://accounts.google.com/gsi/client?hl=en`)
    // doesn't need a dedicated `script-src` entry - it's injected by our own
    // already-trusted bundle, which `'strict-dynamic'` (above) automatically
    // extends trust to.
    `connect-src 'self' ${apiOrigin} https://accounts.google.com`,
    "frame-src 'self' https://accounts.google.com",
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

  return response;
}

export const config = {
  matcher: [
    {
      // The exclusions are anchored with a trailing `/` (or `$`) on purpose:
      // an unanchored `api` also excludes any future route that merely *starts*
      // with those letters - `/api-docs`, `/apidemo` - which would then be
      // served with no CSP at all, silently.
      source: "/((?!api/|_next/static/|_next/image/|favicon.ico$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
