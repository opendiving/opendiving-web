import { NextRequest, NextResponse } from "next/server";

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
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const apiOrigin =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const cspDirectives = [
    "default-src 'self'",
    // `'unsafe-inline'` and `https:` are no-ops in any browser that
    // understands `'nonce-...'`/`'strict-dynamic'` (CSP Level 3) - such
    // browsers ignore them - but keep the site from breaking outright in
    // older browsers that don't. This is the "strict CSP with graceful
    // fallback" pattern from Google's CSP guide, not a real weakening.
    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
    `img-src 'self' data: ${apiOrigin}`,
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin}`,
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
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
