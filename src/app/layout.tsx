import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { AuthProvider } from "@/contexts/AuthContext";
import { ConfigProvider } from "@/contexts/ConfigContext";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/toaster";
import { NonceProvider } from "@/components/nonce-provider";
import { publicConfig, runtimeConfig } from "@/lib/runtime-config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
      default: "OpenDiving - a self-hosted dive log",
      template: "%s | OpenDiving",
    },
    // The README's pitch rather than the previous "Open source diving platform", which
    // said nothing a diver deciding whether to click would care about.
    description:
      "A self-hosted dive log. Your dives, your data - in open formats, on your own server.",
    applicationName: "OpenDiving",
    openGraph: {
      type: "website",
      siteName: "OpenDiving",
      title: "OpenDiving - a self-hosted dive log",
      description:
        "An open-source logbook for scuba divers: gas mixtures, multiple sites per dive, dive-computer import with full depth profiles, gear service history and c-cards.",
      url: siteUrl,
    },
    twitter: {
      card: "summary_large_image",
      title: "OpenDiving - a self-hosted dive log",
      description:
        "An open-source logbook for scuba divers. Your dives, your data - in open formats, on your own server.",
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
