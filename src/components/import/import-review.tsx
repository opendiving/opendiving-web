"use client";

import { Fragment, useState } from "react";
import Link from "next/link";

import {
  ImportCheckInDetails,
  useImportCheckIn,
  type ImportCheckInChoices,
} from "@/components/import/import-check-in-details";
import { ImportDiveCards } from "@/components/import/import-dive-cards";
import { ImportNumberingSuggestion } from "@/components/import/import-numbering-suggestion";
import { ImportReportView } from "@/components/import/import-report-view";
import { Button, ButtonLink } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusMessage } from "@/components/ui/status-message";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import { useCheckinDetails } from "@/contexts/CheckinDetailsContext";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api/error";
import {
  logbookImportAPI,
  type LogbookImportRead,
} from "@/lib/api/logbook-import";
import { formatDateTime } from "@/lib/date-time";
import { checkInWasWritten } from "@/lib/import-check-in";
import { importButtonLabel, importSummaryTerms } from "@/lib/logbook-import";

export interface ImportReviewProps {
  record: LogbookImportRead;
  onApplied: (applied: LogbookImportRead) => void;
  /** The import is gone from where it stood: discarded, or deleted. */
  onRemoved: () => void;
  /** Another device got there first, or the import expired. */
  onOvertaken: () => void;
}

// The way to the log, and back to this page: the review at `/import` holds the
// diver's check-in choices, and `/import/[id]` would start them over.
function useLogHref(record: LogbookImportRead): string {
  const withReturnTo = useWithReturnTo();
  return withReturnTo(`/import/${record.uuid}/log`);
}

const OVERTAKEN = {
  title: "No longer waiting",
  description: "This import was finished on another device, or it expired.",
};

// The files the import could not read, ahead of everything else: the one thing
// on the page a diver can act on before any dive.
function RefusedFiles({ record }: { record: LogbookImportRead }) {
  const refused = record.members.filter((member) => member.refusal);
  if (refused.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm" aria-label="Files that could not be read">
      {refused.map((member, index) => (
        // Indexed: a batch can carry two files of one name.
        <li key={`${member.name}-${index}`} className="break-words">
          <span className="font-medium break-all">{member.name}</span>:{" "}
          <span className="text-destructive">{member.refusal}</span>
        </li>
      ))}
    </ul>
  );
}

// The rows by outcome in a sentence. The unchanged and the skipped have no card,
// so their terms lead to the log page, which names them.
function ImportSummary({ record }: { record: LogbookImportRead }) {
  const logHref = useLogHref(record);
  const terms = importSummaryTerms(record.dives);
  if (terms.length === 0) return null;
  return (
    <p className="text-sm">
      {terms.map((term, index) => (
        <Fragment key={term.outcome}>
          {index > 0 && ", "}
          {term.outcome === "unchanged" || term.outcome === "skipped" ? (
            <Link href={logHref} className="underline underline-offset-2">
              {term.text}
            </Link>
          ) : (
            term.text
          )}
        </Fragment>
      ))}
    </p>
  );
}

function ImportBody({ record }: { record: LogbookImportRead }) {
  return (
    <>
      <RefusedFiles record={record} />
      <ImportSummary record={record} />
      <ImportDiveCards
        dives={record.dives}
        applied={record.status === "applied"}
      />
    </>
  );
}

// The import waiting for the diver's word. Mounted per import, so the check-in
// form inside it is seeded from this import's proposal and no other. The button
// is held back only while something is in flight - see `importButtonLabel`.
function PendingImport({
  record,
  onApplied,
  onRemoved,
  onOvertaken,
}: ImportReviewProps) {
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const { reload: reloadCheckinDetails } = useCheckinDetails();
  const checkIn = useImportCheckIn(record.check_in_details, record.portrait);
  const logHref = useLogHref(record);
  const [phase, setPhase] = useState<"idle" | "importing" | "discarding">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const overtaken = (caught: unknown) => {
    const status = getApiErrorStatus(caught);
    if (status !== 409 && status !== 404) return false;
    toast(OVERTAKEN);
    onOvertaken();
    return true;
  };

  // Whether a detail or the portrait was written is the log's to say, and only an
  // import that offered one has anything to find. Read again if the log cannot
  // be: the check-in surfaces show a shared copy, and a second read costs nothing.
  const refreshCheckIn = async () => {
    if (record.check_in_details.length === 0 && !record.portrait) return;
    const log = await logbookImportAPI.notes(record.uuid).catch(() => null);
    if (log && !checkInWasWritten(log)) return;
    reloadCheckinDetails();
    await refreshUser();
  };

  const apply = async ({ details, portrait }: ImportCheckInChoices) => {
    setError(null);
    setPhase("importing");
    try {
      const applied = await logbookImportAPI.apply(record.uuid, {
        check_in_details: details,
        portrait,
      });
      await refreshCheckIn();
      toast({
        title: "Imported",
        description: "The dives below are in your logbook.",
      });
      onApplied(applied);
    } catch (caught) {
      if (overtaken(caught)) return;
      setError(
        getApiErrorMessage(
          caught,
          "The import could not be completed. Nothing has been changed.",
        ),
      );
    } finally {
      setPhase("idle");
    }
  };

  const handleImport = async () => {
    const choices = await checkIn.collect();
    if (choices !== null) await apply(choices);
  };

  const discard = async () => {
    setError(null);
    setPhase("discarding");
    try {
      await logbookImportAPI.remove(record.uuid, "pending");
      setConfirming(false);
      onRemoved();
    } catch (caught) {
      setConfirming(false);
      if (overtaken(caught)) return;
      setError(
        getApiErrorMessage(
          caught,
          "The import could not be discarded. Please try again.",
        ),
      );
    } finally {
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";

  return (
    <section aria-labelledby="import-review-heading" className="space-y-4">
      <div>
        <h2 id="import-review-heading" className="text-lg font-semibold">
          Review This Import
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {record.expires_at
            ? `Your logbook changes when you import. You can finish this on any device until ${formatDateTime(record.expires_at)}.`
            : "Your logbook changes when you import. You can finish this on any device."}
        </p>
      </div>

      <ImportBody record={record} />
      <ImportReportView record={record} />
      <ImportCheckInDetails checkIn={checkIn} />

      <p className="text-sm">
        <Link href={logHref} className="underline underline-offset-2">
          Import log
        </Link>
      </p>

      <StatusMessage variant="error">{error}</StatusMessage>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleImport} disabled={busy}>
          {phase === "importing" ? (
            <span className="flex items-center gap-2">
              <ButtonSpinner />
              Importing...
            </span>
          ) : (
            importButtonLabel(record.dives)
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirming(true)}
          disabled={busy}
        >
          Discard
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Discard this import?"
        description="The uploaded files are deleted and your logbook stays as it is."
        confirmText="Discard"
        isLoading={phase === "discarding"}
        onConfirm={discard}
      />
    </section>
  );
}

// What became of an import, from the moment it is applied until it leaves the
// history.
function AppliedImport({ record, onRemoved }: ImportReviewProps) {
  const logHref = useLogHref(record);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setError(null);
    setDeleting(true);
    try {
      await logbookImportAPI.remove(record.uuid, "applied");
      setConfirming(false);
      onRemoved();
    } catch (caught) {
      setConfirming(false);
      // Already gone from the history, which is what was asked for.
      if (getApiErrorStatus(caught) === 404) {
        onRemoved();
        return;
      }
      setError(
        getApiErrorMessage(
          caught,
          "The import could not be deleted. Please try again.",
        ),
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section aria-labelledby="import-result-heading" className="space-y-4">
      {/* `role="status"` so the outcome is announced rather than only drawn. */}
      <div role="status">
        <h2 id="import-result-heading" className="text-lg font-semibold">
          Imported
        </h2>
        {record.applied_at && (
          <p className="text-sm text-muted-foreground mt-1">
            {`Written to your logbook on ${formatDateTime(record.applied_at)}.`}
          </p>
        )}
      </div>

      <ImportBody record={record} />
      <ImportNumberingSuggestion
        before={record.numbering}
        dives={record.dives}
      />
      <ImportReportView record={record} />

      <p className="text-sm">
        <Link href={logHref} className="underline underline-offset-2">
          Import log
        </Link>
      </p>

      <StatusMessage variant="error">{error}</StatusMessage>

      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/dives">Done</ButtonLink>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirming(true)}
          disabled={deleting}
        >
          Delete
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this import?"
        description="Its review and log leave your history. The dives it wrote stay in your logbook."
        confirmText="Delete"
        variant="destructive"
        isLoading={deleting}
        onConfirm={remove}
      />
    </section>
  );
}

// One import of the account's, whichever page it is reached from.
export function ImportReview(props: ImportReviewProps) {
  const { record } = props;
  return record.status === "applied" ? (
    <AppliedImport {...props} />
  ) : (
    <PendingImport key={record.uuid} {...props} />
  );
}
