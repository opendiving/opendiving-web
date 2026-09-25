import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { AuthProvider } from "@/contexts/AuthContext";
import { ConfigProvider } from "@/contexts/ConfigContext";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/toaster";
import { NonceProvider } from "@/components/nonce-provider";
import { DeviceMemoryInstaller } from "@/components/device-memory-installer";
import { publicConfig, runtimeConfig } from "@/lib/runtime-config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// This layout reads `headers()` for the CSP nonce, which under `cacheComponents` is
// runtime data outside any Suspense boundary: every route's static shell is empty and
// the build fails on it. `false` allows a blocking route, and the root is the only
// placement that reaches the routes needing it: both non-root layouts and every page
// behind the auth guard are Client Components, which cannot carry this export, and the
// handful of Server Component pages that could - `/`, `/support`, `/privacy`, `/terms`,
// `/admin` - are not the ones that need it.
export const instant = false;

// A function rather than an exported `metadata` object because `siteUrl` is read from
// the environment at request time (`lib/runtime-config.ts`), and a module-level constant
// would be evaluated while the image is being built - freezing whatever the build
// machine had into every instance that ever runs it.
//
// `metadataBase` is where relative URLs in metadata (OpenGraph images, canonicals)
// resolve against. Without it Next warns on every build and emits relative `og:image`
// URLs, which no crawler or link unfurler can fetch. A self-hosted instance sets
// `SITE_URL` to its own origin; the localhost fallback is right for development and
// harmless anywhere else, since the only pages worth unfurling are public ones a private
// deployment doesn't expose.
export function generateMetadata(): Metadata {
  const { siteUrl } = runtimeConfig();

  return {
    metadataBase: new URL(siteUrl),
    // The template is what gives every page a distinct tab title without each one
    // having to repeat the product name. Pages that export their own `title` string
    // get it wrapped; `default` covers the ones that export none.
    title: {
      default: "OpenDiving - a dive log built to outlive every vendor",
      template: "%s | OpenDiving",
    },
    // The README's pitch rather than the previous "Open source diving platform", which
    // said nothing a diver deciding whether to click would care about. It leads with what
    // the log is rather than with how it is deployed: this metadata is served by every
    // instance, and "a self-hosted dive log" is a claim about the reader's server that the
    // reader may well not be the one running. See "Self-hosting is a capability, not the
    // product's identity" in DECISIONS.md.
    //
    // It also no longer promises the imported file back. A logbook the API
    // converts is read once and discarded, so the promise is true only of a file
    // uploaded to a dive - a qualifier the README's body has room for and a
    // one-line pitch does not. See "'The original file is kept' is a claim about
    // an upload to a dive" in DECISIONS.md; the front door's README carries the
    // replacement clause verbatim.
    description:
      "A dive log built to outlive every vendor. Your dives, your data - vendor exports in, open formats out, everything in one click. Yours to self-host.",
    applicationName: "OpenDiving",
    openGraph: {
      type: "website",
      siteName: "OpenDiving",
      title: "OpenDiving - a dive log built to outlive every vendor",
      description:
        "An open-source logbook for scuba divers: gas mixtures, multiple sites per dive, dive-computer import with full depth profiles, gear service history and c-cards.",
      url: siteUrl,
    },
    twitter: {
      card: "summary_large_image",
      title: "OpenDiving - a dive log built to outlive every vendor",
      description:
        "An open-source logbook for scuba divers. Your dives, your data - vendor exports in, open formats, and yours to take out at any time.",
    },
  };
}

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
      <body className={inter.className}>
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
                <AppShell>{children}</AppShell>
                <Toaster />
              </AuthProvider>
            </ThemeProvider>
          </ConfigProvider>
        </NonceProvider>
      </body>
    </html>
  );
}
