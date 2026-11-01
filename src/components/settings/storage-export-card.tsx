"use client";

import { DataExportCard } from "@/components/export/data-export-card";
import { useAuth } from "@/contexts/AuthContext";

export function StorageExportCard() {
  const { user } = useAuth();

  if (!user) return null;

  return <DataExportCard username={user.username} />;
}
