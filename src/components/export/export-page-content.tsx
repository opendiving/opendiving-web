"use client";

import { useAuthGuard } from "@/hooks/useAuthGuard";
import { DataExportCard } from "@/components/export/data-export-card";
import { PageSpinner } from "@/components/ui/page-spinner";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";

export function ExportPageContent() {
  const { user, isAuthenticated, isLoading } = useAuthGuard();

  if (isLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated || !user) {
    return null; // Will redirect to signin
  }

  return (
    <div>
      <IndexHero
        title="Export"
        description="Take a copy of everything you have entered."
      />

      <div className={HERO_BODY}>
        <DataExportCard username={user.username} />
      </div>
    </div>
  );
}
