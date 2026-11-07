"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { ImportBodySkeleton } from "@/components/import/import-page-frame";
import { ImportReview } from "@/components/import/import-review";
import { HERO_BODY, PlainHero } from "@/components/ui/map-hero";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useResource } from "@/hooks/useResource";
import { useReturnTo } from "@/hooks/useReturnTo";
import {
  logbookImportAPI,
  type LogbookImportRead,
} from "@/lib/api/logbook-import";
import { labelForPath } from "@/lib/return-to";

// `/import/[id]`: one import by its address, pending or applied, on the component
// `/import` draws. What no longer stands here goes to `/import`, which reads the
// account's pending import and shows what it finds.
export function ImportDetailPageContent() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuthGuard();
  const back = useReturnTo({ href: "/import", label: labelForPath("/import") });
  const { resource } = useResource<LogbookImportRead>(logbookImportAPI.get, {
    enabled: !!user,
    errorMessage: "This import could not be found.",
    redirectTo: "/import",
  });
  const [applied, setApplied] = useState<LogbookImportRead | null>(null);
  const record = applied ?? resource;

  if (!isLoading && (!isAuthenticated || !user)) {
    return null; // Will redirect to signin
  }

  const toImport = () => router.replace("/import");

  return (
    <div>
      <PlainHero
        backHref={back.href}
        backLabel={back.label}
        icon={Upload}
        title="Import"
        figures={[]}
      />
      <div className={HERO_BODY}>
        {record ? (
          <ImportReview
            record={record}
            onApplied={setApplied}
            onRemoved={toImport}
            onOvertaken={toImport}
          />
        ) : (
          <ImportBodySkeleton />
        )}
      </div>
    </div>
  );
}
