"use client";

import { useParams } from "next/navigation";
import { ScrollText } from "lucide-react";

import { ImportDiveNotes } from "@/components/import/import-dive-notes";
import { ImportBodySkeleton } from "@/components/import/import-page-frame";
import { ImportNoteGroups } from "@/components/import/import-note-groups";
import { HERO_BODY, PlainHero } from "@/components/ui/map-hero";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useResource } from "@/hooks/useResource";
import { useReturnTo } from "@/hooks/useReturnTo";
import {
  logbookImportAPI,
  type LogbookImportDiveNotes,
  type LogbookImportNotes,
} from "@/lib/api/logbook-import";
import {
  recordingDeviceLabel,
  UNNAMED_DEVICE_LABEL,
} from "@/lib/dive-recordings";
import { importOutcomeLabel, importStartText } from "@/lib/logbook-import";
import { labelForPath } from "@/lib/return-to";

function DiveEntry({ dive }: { dive: LogbookImportDiveNotes }) {
  const device = dive.device
    ? (recordingDeviceLabel(dive.device) ?? UNNAMED_DEVICE_LABEL)
    : null;
  const annotated = dive.notes.length > 0 || dive.notes_truncated > 0;
  return (
    <li className="space-y-1 px-3 py-2">
      <h3 className="text-sm font-medium break-words">
        {[
          importStartText(dive.start_time),
          device,
          importOutcomeLabel(dive.outcome),
        ]
          .filter(Boolean)
          .join(" · ")}
      </h3>
      {dive.reason && (
        <p className="text-sm text-muted-foreground">{dive.reason}</p>
      )}
      {annotated && (
        <ImportDiveNotes
          notes={dive.notes}
          notesTruncated={dive.notes_truncated}
        />
      )}
    </li>
  );
}

// `/import/[id]/log`: every dive of an import, the ones without a card among them,
// and everything the import has to say. Not needed most of the time, so kept off
// the review.
export function ImportLogPageContent() {
  const params = useParams();
  const back = useReturnTo({
    href: `/import/${params.id as string}`,
    label: labelForPath("/import"),
  });
  const { user, isAuthenticated, isLoading } = useAuthGuard();
  const { resource: log } = useResource<LogbookImportNotes>(
    logbookImportAPI.notes,
    {
      enabled: !!user,
      errorMessage: "This import's log could not be found.",
      redirectTo: "/import",
    },
  );

  if (!isLoading && (!isAuthenticated || !user)) {
    return null; // Will redirect to signin
  }

  return (
    <div>
      <PlainHero
        backHref={back.href}
        backLabel={back.label}
        icon={ScrollText}
        title="Import log"
        figures={[]}
      />
      <div className={HERO_BODY}>
        {log ? (
          <div className="space-y-6">
            {log.dives.length > 0 && (
              <section aria-labelledby="import-log-dives" className="space-y-2">
                <h2 id="import-log-dives" className="text-sm font-medium">
                  Dives ({log.dives.length})
                </h2>
                <ul className="divide-y divide-border rounded-md border">
                  {log.dives.map((dive, index) => (
                    // Indexed: a skipped dive has no uuid, and two rows can name
                    // one where a document claims it twice.
                    <DiveEntry key={`${dive.uuid}-${index}`} dive={dive} />
                  ))}
                </ul>
              </section>
            )}
            <ImportNoteGroups
              groups={log.notes}
              notesTruncated={log.notes_truncated}
            />
          </div>
        ) : (
          <ImportBodySkeleton />
        )}
      </div>
    </div>
  );
}
