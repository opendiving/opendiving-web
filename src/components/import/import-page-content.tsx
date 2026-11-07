"use client";

import { useCallback, useEffect, useState } from "react";

import { ImportBodySkeleton } from "@/components/import/import-page-frame";
import { ImportHistory } from "@/components/import/import-history";
import { ImportPicker } from "@/components/import/import-picker";
import { ImportReview } from "@/components/import/import-review";
import { Button } from "@/components/ui/button";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";
import { StatusMessage } from "@/components/ui/status-message";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { getApiErrorStatus } from "@/lib/api/error";
import {
  logbookImportAPI,
  type LogbookImportRead,
} from "@/lib/api/logbook-import";

// `undefined` until the page has heard, `null` once it knows nothing is pending.
type Shown = LogbookImportRead | null | undefined;

function ImportFlow({ enabled }: { enabled: boolean }) {
  const [record, setRecord] = useState<Shown>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      setRecord(await logbookImportAPI.pending());
    } catch (caught) {
      if (getApiErrorStatus(caught) === 404) setRecord(null);
      else {
        console.error("Failed to read the pending import:", caught);
        setLoadFailed(true);
      }
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  if (loadFailed) {
    return (
      <div className="space-y-3">
        <StatusMessage variant="error">
          Your import could not be loaded.
        </StatusMessage>
        <Button type="button" variant="outline" onClick={load}>
          Try again
        </Button>
      </div>
    );
  }

  if (record === undefined) return <ImportBodySkeleton />;

  if (record === null) {
    return (
      <div className="space-y-6">
        <ImportPicker onCreated={setRecord} onOpenPending={load} />
        <ImportHistory />
      </div>
    );
  }

  return (
    <ImportReview
      record={record}
      onApplied={setRecord}
      onRemoved={load}
      onOvertaken={load}
    />
  );
}

// `/import`: one door for every file the app reads. The files go up once and the
// server holds them, so what this page shows is the account's own state: a pending
// import, from whichever device uploaded it, or the picker and what came before.
export function ImportPageContent() {
  const { user, isAuthenticated, isLoading } = useAuthGuard();

  if (!isLoading && (!isAuthenticated || !user)) {
    return null; // Will redirect to signin
  }

  return (
    <div>
      <IndexHero
        title="Import"
        description="Bring dives in from your dive computer, another logbook or an OpenDiving archive. Your files go up once, and you can review what they add and change on any device."
      />

      <div className={HERO_BODY}>
        <ImportFlow enabled={!!user} />
      </div>
    </div>
  );
}
