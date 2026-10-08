"use client";

import { useAuthGuard } from "@/hooks/useAuthGuard";
import { PageSpinner } from "@/components/ui/page-spinner";
import { SettingsNav } from "@/components/settings/settings-nav";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";

// A route group rather than `app/settings/layout.tsx`, so the menu and the auth gate
// stay off `/settings/confirm-email`: that page is opened from an email, often signed
// out, and draws its own chrome-free layout.
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, isLoading } = useAuthGuard();

  if (isLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect to signin
  }

  return (
    <div>
      <IndexHero title="Settings" subtitle="Manage your account information." />

      <div className={HERO_BODY}>
        <div className="grid grid-cols-1 gap-6 max-sm:gap-2.5 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <SettingsNav />
          <div className="min-w-0 space-y-6 max-sm:space-y-2.5">{children}</div>
        </div>
      </div>
    </div>
  );
}
