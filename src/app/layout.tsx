import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import { headers } from "next/headers";
import { AuthProvider } from "@/contexts/AuthContext";
import { CheckinDetailsProvider } from "@/contexts/CheckinDetailsContext";
import { ConfigProvider } from "@/contexts/ConfigContext";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/layout/app-shell";
import { LaunchSplash } from "@/components/layout/launch-splash";
import { Toaster } from "@/components/ui/toaster";
import { NonceProvider } from "@/components/nonce-provider";
import { DeviceMemoryInstaller } from "@/components/device-memory-installer";
import { PAGE_TITLE_TEMPLATE } from "@/lib/page-title";
import { publicConfig, runtimeConfig } from "@/lib/runtime-config";
import { SITE_DESCRIPTION } from "@/lib/site-description";
import "./globals.css";

// `--font-inter` is for what cannot take the class: the API reference's Scalar theme.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// The wordmark's face, and nothing else's. Outfit's O, i-dots and single-storey g are
// drawn from one circle, so the name reads as part of the three-bubble mark; Inter's O
// is a squarer superellipse. SIL Open Font Licence.
const outfit = Outfit({
  weight: "700",
  subsets: ["latin"],
  variable: "--font-outfit",
});

// This layout reads `headers()` for the CSP nonce, which under `cacheComponents` is
// runtime data outside any Suspense boundary: every route's static shell is empty and
// the build fails on it. `false` allows a blocking route, and the root is the placement
// because the read is in it: nothing lower covers the app.
export const instant = false;

// A function rather than an exported `metadata` object because `siteUrl` is read from
// the environment at request time (`lib/runtime-config.ts`), and a module-level constant
// would be evaluated while the image is being built - freezing whatever the build
// machine had into every instance that ever runs it.
//
// `metadataBase` is what relative URLs in metadata resolve against - `/join`'s canonical
// `/` among them - and a relative URL field without it fails the build. A self-hosted
// instance sets `SITE_URL` to its own origin; the localhost fallback is right for
// development and harmless anywhere else, since the only pages worth unfurling are
// public ones a private deployment doesn't expose.
export function generateMetadata(): Metadata {
  const { siteUrl } = runtimeConfig();

  return {
    metadataBase: new URL(siteUrl),
    // Every page names itself through `metadata`, and this wraps the name; `default`
    // is only for a route that gives none. So Firefox on iOS, which names a
    // home-screen shortcut after `document.title` and never reads the manifest,
    // offers the page's own title there - "Dives – OpenDiving" - for the diver to
    // edit; a distinct name per tab is the owner's call over a bare one there.
    title: {
      default: "OpenDiving",
      template: PAGE_TITLE_TEMPLATE,
    },
    description: SITE_DESCRIPTION,
    applicationName: "OpenDiving",
    // The site's own fields only, so every page previews as itself: Next fills an
    // `openGraph` without a title or description from the page's own, and the Twitter
    // card from that. No `url` either - an unfurler names the address it fetched.
    openGraph: { type: "website", siteName: "OpenDiving" },
    // `summary`, since there is no image to make a large card of.
    twitter: { card: "summary" },
  };
}

// The browser chrome of the installed app. The app's theme follows the system by
// default, so the bar follows it too: white in light, the dark theme's `--background`
// (`240 4% 9%`) in dark. A diver who pins the app light under a dark OS gets a dark
// bar, which the media query cannot know about.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#161618" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Set by src/proxy.ts alongside the per-request CSP nonce; forwarded to
  // next-themes so it can tag its no-flash-of-wrong-theme bootstrap script
  // with it - the CSP's script-src only allows same-nonce scripts to run.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.className} ${inter.variable} ${outfit.variable}`}
      >
        <NonceProvider nonce={nonce}>
          {/* Rendered rather than imported, and rendered here rather than
              anywhere narrower: evaluating that module is what arms the
              device-memory switch's write suppression, and a side-effect-only
              import from this file - an async Server Component - would reach
              the browser bundle only conditionally. See the component. */}
          <DeviceMemoryInstaller />
          {/* Everything below is a Client Component, and this is the only place
              the environment is legible - so the instance's configuration is read
              here and carried down rather than looked up where it is used. */}
          <ConfigProvider config={publicConfig()}>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              nonce={nonce}
            >
              <AuthProvider>
                <CheckinDetailsProvider>
                  <AppShell>{children}</AppShell>
                </CheckinDetailsProvider>
                <Toaster />
                <LaunchSplash nonce={nonce} />
              </AuthProvider>
            </ThemeProvider>
          </ConfigProvider>
        </NonceProvider>
      </body>
    </html>
  );
}
