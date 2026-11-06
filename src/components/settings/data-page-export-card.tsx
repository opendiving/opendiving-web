"use client";

import { DataExportCard } from "@/components/export/data-export-card";
import { useAuth } from "@/contexts/AuthContext";

// The Data page is a Server Component for its metadata, so the signed-in name the
// export card needs is read here. The settings layout has already waited for a user.
export function DataPageExportCard() {
  const { user } = useAuth();

  if (!user) return null;

  return <DataExportCard username={user.username} />;
}
