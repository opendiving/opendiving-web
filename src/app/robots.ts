import type { MetadataRoute } from "next";

import { runtimeConfig } from "@/lib/runtime-config";

// `robots.ts` is a route handler like any other, and Next prerenders one that reads
// nothing request-scoped - which would resolve `WEB_NOINDEX` on the build machine and
// freeze the answer into the published image, the exact trap `lib/runtime-config.ts`
// exists to avoid. `force-dynamic` is what keeps the read in the container.
export const dynamic = "force-dynamic";

/**
 * `robots.txt`. Open to crawlers by default; `WEB_NOINDEX=true` closes the whole site,
 * which is what a private instance on a public domain wants.
 *
 * A `Disallow` is a request not to *fetch*, not a promise not to *list* - a URL a crawler
 * heard about elsewhere can still be indexed without ever being fetched. `src/proxy.ts`
 * sends `X-Robots-Tag: noindex, nofollow` alongside this for that reason; the two
 * together are what "keep crawlers out" actually takes.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: runtimeConfig().noindex
      ? { userAgent: "*", disallow: "/" }
      : { userAgent: "*", allow: "/" },
  };
}
