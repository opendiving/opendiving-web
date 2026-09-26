"use client";

import { useAuthGuard } from "@/hooks/useAuthGuard";
import { PageSpinner } from "@/components/ui/page-spinner";
import { SettingsNav } from "@/components/settings/settings-nav";

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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account information.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <SettingsNav />
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
