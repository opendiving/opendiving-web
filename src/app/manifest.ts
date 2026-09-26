import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION } from "@/lib/site-description";

// Constants only, so unlike `robots.ts` it needs no `connection()`: nothing here is
// per-instance, and prerendering it at build time is correct.
//
// `start_url` is the dashboard, not `/`: an installed app that opened on the marketing
// page would send a signed-in diver through a redirect every launch. No service worker
// ships with this - Chrome installs from its menu without one, and the automatic install
// prompt is not wanted.
//
// Each icon is listed twice, once per purpose, because the type admits one purpose per
// entry. The same file serves both: `scripts/generate-favicon.mjs` keeps the whole mark
// inside the maskable safe zone.
export default function manifest(): MetadataRoute.Manifest {
  const icons = [192, 512].flatMap((size) =>
    (["any", "maskable"] as const).map((purpose) => ({
      src: `/icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose,
    })),
  );

  return {
    id: "/",
    name: "OpenDiving",
    short_name: "OpenDiving",
    description: SITE_DESCRIPTION,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    theme_color: "#ffffff",
    background_color: "#ffffff",
    icons,
  };
}
