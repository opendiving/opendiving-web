"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { QuickCreateProvider } from "@/components/layout/quick-create";

// Routes that render their own standalone, chrome-free layout.
const NO_CHROME_ROUTES = [
  "/signin",
  "/onboarding",
  "/auth/verify",
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
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </QuickCreateProvider>
  );
}
