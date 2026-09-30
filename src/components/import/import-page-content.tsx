"use client";

import { useRef, useState } from "react";
import Link from "next/link";

import type { ImportCheckInChoices } from "@/components/import/import-check-in-details";
import { ImportDiveTable } from "@/components/import/import-dive-table";
import { ImportDropZone } from "@/components/import/import-drop-zone";
import {
  ImportFileList,
  type SelectedImportFile,
} from "@/components/import/import-file-list";
import { ImportReportView } from "@/components/import/import-report-view";
import { ImportReview } from "@/components/import/import-review";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Meter } from "@/components/ui/meter";
import { PageSpinner } from "@/components/ui/page-spinner";
import { Progress } from "@/components/ui/progress";
import { StatusMessage } from "@/components/ui/status-message";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  logbookImportAPI,
  MAX_IMPORT_DOCUMENT_SIZE,
  type ImportPreview,
  type ImportResult,
} from "@/lib/api/logbook-import";
import type { WalkedDrop } from "@/lib/dropped-files";
import { formatFileSize } from "@/lib/format";
import { checkInWasWritten } from "@/lib/import-check-in";
import {
  importFileRefusal,
  importSelectionRefusal,
  isHiddenImportPath,
  isZipFile,
} from "@/lib/logbook-import";

// The files a read was sent, in the order sent - a `members` row's `part` is an
// index into it - held beside the token because the apply sends them again and
// the API refuses a token minted for a different set.
interface Plan {
  sent: SelectedImportFile[];
  preview: ImportPreview;
}

interface Transfer {
  sent: number;
  total: number;
}

const selectionKey = ({ file, path }: { file: File; path: string }) =>
  `${path}\u0000${file.size}\u0000${file.lastModified}`;

function UploadProgress({ transfer }: { transfer: Transfer }) {
  const uploaded = transfer.sent >= transfer.total;
  return (
    <div className="space-y-2">
      <Progress
        value={transfer.sent}
        max={transfer.total}
        aria-label="Uploading the files"
        valueText={`${formatFileSize(transfer.sent)} of ${formatFileSize(transfer.total)}`}
      />
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {uploaded ? (
          <>
            <ButtonSpinner />
            Reading the files...
          </>
        ) : (
          `Uploading ${formatFileSize(transfer.sent)} of ${formatFileSize(transfer.total)}`
        )}
      </p>
    </div>
  );
}

function ImportFlow() {
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const nextId = useRef(0);

  const [files, setFiles] = useState<SelectedImportFile[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [stale, setStale] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "importing">("idle");
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the browser could not read out of the last drop, which never reached
  // the selection and so has no row to say so.
  const [unreadable, setUnreadable] = useState<string[]>([]);

  const busy = phase !== "idle";
  const sendable = files.filter((item) => item.refusal === null);
  const selectionRefusal = importSelectionRefusal(
    sendable.map((item) => item.file),
  );
  const unzippedBytes = sendable
    .filter((item) => !isZipFile(item.file))
    .reduce((sum, item) => sum + item.file.size, 0);

  // A plan describes the files it was read from and no others, so any change to
  // the selection discards it and offers the read again.
  const selectionChanged = () => {
    if (plan) setStale(true);
    setPlan(null);
    setError(null);
  };

  const addFiles = ({ picked, unreadable }: WalkedDrop) => {
    setUnreadable(unreadable);
    // Packaging and empty files are dropped without a row: the API reads nothing
    // from either, and a `.DS_Store` among 46 dives is noise.
    const known = new Set(files.map(selectionKey));
    const added = picked
      .filter(
        (item) =>
          item.file.size > 0 &&
          !isHiddenImportPath(item.path) &&
          !known.has(selectionKey(item)),
      )
      .map(({ file, path }) => ({
        id: nextId.current++,
        file,
        path,
        refusal: importFileRefusal(file),
      }));
    if (added.length === 0) return;
    setFiles((current) => [...current, ...added]);
    selectionChanged();
  };

  const removeFile = (id: number) => {
    setFiles((current) => current.filter((item) => item.id !== id));
    selectionChanged();
  };

  const trackTransfer = (sent: number, total: number) =>
    setTransfer({ sent, total });

  const read = async () => {
    const sent = sendable;
    // A new read supersedes whatever was on screen, so the old plan goes before
    // the request rather than after it: a read that fails must not leave the
    // previous files' rows standing.
    setPlan(null);
    setStale(false);
    setError(null);
    setPhase("reading");
    setTransfer({
      sent: 0,
      total: sent.reduce((sum, item) => sum + item.file.size, 0),
    });
    try {
      const preview = await logbookImportAPI.preview(
        sent.map((item) => item.file),
        trackTransfer,
      );
      setPlan({ sent, preview });
    } catch (caught) {
      setError(
        getApiErrorMessage(
          caught,
          // Shown only when the API sent no `detail` - a proxy's bare 413 among
          // them. The API's own refusals name the formats and the bounds.
          "The files could not be read. Please check them and try again.",
        ),
      );
    } finally {
      setPhase("idle");
      setTransfer(null);
    }
  };

  const apply = async ({ details, portrait }: ImportCheckInChoices) => {
    if (!plan) return;
    setError(null);
    setPhase("importing");
    setTransfer({
      sent: 0,
      total: plan.sent.reduce((sum, item) => sum + item.file.size, 0),
    });
    try {
      const applied = await logbookImportAPI.apply(
        plan.sent.map((item) => item.file),
        plan.preview.token,
        details,
        portrait,
        trackTransfer,
      );
      // Only when a fact or the portrait changed: the check-in cards seed from
      // the signed-in user, and a card saved from a stale copy would send the
      // imported facts back as nulls.
      if (checkInWasWritten(applied)) await refreshUser();
      setResult(applied);
      setPlan(null);
      setFiles([]);
      toast({
        title: "Imported",
        description: "Each dive below says what happened to it.",
      });
    } catch (caught) {
      setError(
        getApiErrorMessage(
          caught,
          "The import could not be completed. Nothing has been changed.",
        ),
      );
    } finally {
      setPhase("idle");
      setTransfer(null);
    }
  };

  if (result) {
    return (
      <section aria-labelledby="import-result-heading" className="space-y-4">
        {/* `role="status"` so the outcome is announced rather than only drawn;
            the toast carries the announcement, and this is the copy that stays. */}
        <div role="status">
          <h2 id="import-result-heading" className="text-lg font-semibold">
            Imported
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            The import is written. Each dive below says what happened to it.
          </p>
        </div>
        {result.dives.length > 0 && (
          <ImportDiveTable
            dives={result.dives}
            members={result.members}
            written
          />
        )}
        {/* `archive` is a property of the files, which the preview reported and
            the result does not repeat; `true` suppresses advice to import the
            archive about a decision already taken. */}
        <ImportReportView report={result} archive />
        <Button asChild>
          <Link href="/dives">Done</Link>
        </Button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="import-files-heading" className="space-y-3">
        <h2 id="import-files-heading" className="sr-only">
          Files
        </h2>
        <ImportDropZone disabled={busy} onFiles={addFiles} />
        {unreadable.length > 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            {`The browser could not read ${unreadable.length === 1 ? "this from the drop" : `these ${unreadable.length} from the drop`}, so ${unreadable.length === 1 ? "it was" : "they were"} left out: ${unreadable.join(", ")}.`}
          </p>
        )}

        {files.length > 0 && (
          <>
            <ImportFileList
              files={files}
              members={plan?.preview.members ?? []}
              sent={plan?.sent ?? []}
              disabled={busy}
              onRemove={removeFile}
            />
            {/* Information rather than a refusal: only the API can tell a
                full-export archive from a zip of computer files, so what one
                import may read in all is counted over the files that are not
                zips, and the API answers past it. */}
            <div className="space-y-1">
              <Meter
                value={unzippedBytes}
                max={MAX_IMPORT_DOCUMENT_SIZE}
                aria-label="Files to read, against what one import can read"
                valueText={`${formatFileSize(unzippedBytes)} of ${formatFileSize(MAX_IMPORT_DOCUMENT_SIZE)}`}
              />
              <p className="text-xs text-muted-foreground">
                {`${formatFileSize(unzippedBytes)} of files that are not zips, of the ${formatFileSize(MAX_IMPORT_DOCUMENT_SIZE)} one import can read.`}
              </p>
            </div>
            {selectionRefusal && (
              <StatusMessage variant="error">{selectionRefusal}</StatusMessage>
            )}
            {!plan && (
              <div className="space-y-2">
                {stale && (
                  <p className="text-sm text-muted-foreground">
                    The files changed since they were read. Read them again to
                    see what they would import.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={read}
                    disabled={
                      busy || sendable.length === 0 || selectionRefusal !== null
                    }
                  >
                    {stale ? "Read the files again" : "Read the files"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFiles([]);
                      setStale(false);
                      setError(null);
                    }}
                    disabled={busy}
                  >
                    Remove all
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {phase === "reading" && transfer && (
          <UploadProgress transfer={transfer} />
        )}
      </section>

      {error && <StatusMessage variant="error">{error}</StatusMessage>}

      {plan && (
        <ImportReview
          key={plan.preview.token}
          preview={plan.preview}
          isImporting={phase === "importing"}
          onImport={apply}
        />
      )}

      {phase === "importing" && transfer && (
        <UploadProgress transfer={transfer} />
      )}
    </div>
  );
}

// `/import`: one door for every file the app reads. The files are read - which
// writes nothing - and the page shows what each became and what would happen to
// each dive; the import writes that, and the result is the dives it reached.
export function ImportPageContent() {
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
        <h1 className="text-3xl font-bold text-foreground mb-2">Import</h1>
        <p className="text-muted-foreground">
          Bring dives in from your dive computer, another logbook or an
          OpenDiving archive. You see what each file becomes before anything is
          written.
        </p>
      </div>
      <ImportFlow />
    </div>
  );
}
