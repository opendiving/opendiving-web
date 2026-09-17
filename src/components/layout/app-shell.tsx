"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { QuickCreateProvider } from "@/components/layout/quick-create";

// Routes that render their own standalone, chrome-free layout. They share
// `StandaloneShell`, which carries the `<main>` element this component would
// otherwise be the app's only source of.
//
// Exported because it is half the definition of a *destination* - a route a
// signed-in diver navigates to inside the chrome - which is what decides where a
// `loading.tsx` belongs. `loading-placement.test.ts` derives that set from here
// rather than listing it.
export const NO_CHROME_ROUTES = [
  "/signin",
  "/onboarding",
  // The offer to undo a deletion, and `/onboarding`'s counterpart in every way that
  // matters here: a verified identity with no session yet, so there is no user menu
  // to draw and nowhere in the app to go until the account is back.
  "/restore",
  "/auth/verify",
  // Where Google returns a visitor mid-sign-in. Same state as `/auth/verify`: a
  // round trip that has left and come back, with no session yet to draw a user
  // menu from.
  "/auth/google/callback",
  "/settings/confirm-email",
  // The screen after an account deletion. The header's user menu belongs to a
  // session that has just been blacklisted, and offering a signed-out visitor
  // "Dashboard" and "Log a dive" on the way out is an invitation to a 401.
  "/goodbye",
];

function isChromeFree(pathname: string | null): boolean {
  if (!pathname) return false;
  return NO_CHROME_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Renders the persistent app chrome (Header + Footer) around page content.
 *
 * Living once in the root layout (rather than being re-declared on every
 * page) means Header/Footer no longer unmount and remount on every
 * navigation, which is what made switching between pages feel janky.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isChromeFree(pathname)) {
    return <>{children}</>;
  }

  return (
    <QuickCreateProvider>
      {/* `print:min-h-0` because `vh` under print media is the *paper's* height, not
          the printable area inside the browser's own margins - so `min-h-screen`
          makes this box taller than the page it is on and spills an empty sheet out
          of the printer. It only has to hold the footer down on a short screen, and
          the footer does not print. */}
      <div className="flex min-h-screen flex-col print:min-h-0">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </QuickCreateProvider>
  );
}
