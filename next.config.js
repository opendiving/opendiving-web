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
    // Content-Security-Policy and Strict-Transport-Security are set per-request
    // by src/proxy.ts instead of here - the first needs a fresh, unpredictable
    // nonce on every response, and the second depends on whether the request
    // arrived over HTTPS and on a variable read at runtime. What is left below
    // is static: the same value for every request of every deployment, which is
    // what this build-time hook can honestly express.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
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
