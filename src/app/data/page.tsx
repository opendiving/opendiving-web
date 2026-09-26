"use client";

import { useAuthGuard } from "@/hooks/useAuthGuard";
import { DataExportCard } from "@/components/data/data-export-card";
import { DataImportCard } from "@/components/data/data-import-card";
import { PageSpinner } from "@/components/ui/page-spinner";

export default function DataPage() {
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
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Import and Export
        </h1>
        <p className="text-muted-foreground">
          Take a copy of everything you have entered, or bring a logbook in.
        </p>
      </div>

      <div className="space-y-6">
        <DataExportCard username={user.username} />
        <DataImportCard />
      </div>
    </div>
  );
}
