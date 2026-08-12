/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // No `images.remotePatterns` on purpose. Nothing in the app uses
  // `next/image` - private card images go through `useAuthedBlobUrl` and a
  // plain `<img>` (see `certification-card-image.tsx`), because they need an
  // `Authorization` header the image optimizer can't send. An entry here
  // wouldn't just be dead config: `/_next/image?url=...` makes the *server*
  // fetch whatever it allows, and a host with no `port`/`pathname` constraint
  // matches every port and path on that host, turning the optimizer into an
  // SSRF probe of whatever else is listening next to the app.
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    // Content-Security-Policy is set per-request by src/proxy.ts instead of
    // here, since it needs a fresh, unpredictable nonce on every response.
    // Everything below is static and safe to apply route-wide.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // `upgrade-insecure-requests` in the CSP rewrites subresource URLs,
          // but it can't protect the *first* navigation to http://... - the
          // browser has no memory of the origin yet, which is exactly the
          // window an on-path attacker needs. HSTS closes it. Harmless if the
          // TLS-terminating proxy in front already sets one; the proxy's value
          // wins where both are present.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Legacy fallback for browsers that don't support the CSP
          // `frame-ancestors` directive set in proxy.ts.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
