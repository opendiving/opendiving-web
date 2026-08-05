/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
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
