"use client";

import { useRef, useState } from "react";
import { HardDriveUpload, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  importSourceLabel,
  logbookImportAPI,
  LOGBOOK_IMPORT_ACCEPT,
  MAX_IMPORT_ARCHIVE_SIZE,
  MAX_IMPORT_DOCUMENT_SIZE,
  type ImportPreview,
  type ImportReport,
} from "@/lib/api/logbook-import";
import {
  collectionLabel,
  collectionRowIsEmpty,
  conversionKindLabel,
  conversionKindTone,
  conversionWhereSentence,
  fileRestoreHint,
  importSourceSentence,
  importTotals,
  noteIsWarning,
  truncatedConversionSentence,
  truncatedNotesSentence,
} from "@/lib/logbook-import";

// A zip is the archive, anything else is treated as a bare document. Only used to
// pick which client-side size ceiling to check against - the API decides what the
// bytes actually are, and a `.zip` that isn't one comes back as a 415. A `.fit`,
// an `.ssrf` or a UDDF lands in the document bucket, which is the API's own rule:
// whatever shape a logbook arrives in, at most a document's worth of it becomes
// one logbook in memory.
function isArchiveUpload(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type === "application/zip";
}

// The row colour per finding kind, and the badge beside it. Only `dropped` is a
// loss and only `dropped` is amber; the rest explain rather than warn, and an
// unfamiliar kind lands on `neutral` - see `conversionKindTone`.
const CONVERSION_TONE_CLASSES = {
  warning: {
    row: "text-amber-700 dark:text-amber-500",
    badge: "border-amber-600/40 text-amber-700 dark:text-amber-500",
  },
  neutral: { row: "text-foreground", badge: "border-border text-foreground" },
  muted: {
    row: "text-muted-foreground",
    badge: "border-border/60 text-muted-foreground",
  },
} as const;

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

// The report both responses carry, rendered identically for the plan and for the
// result. Deliberately one component: a preview the diver approved and the result
// they got back are only worth comparing if they look the same, which is the same
// reason the API models them as one shape. All four sections obey that, the
// conversion one included - it is on `ImportReport` rather than on the preview
// precisely so the panel that stays on screen afterwards still carries it.
//
// Everything here is a *persistent* element rather than a toast. A logbook import
// can return hundreds of notes about individual dives, and the diver has to still
// be able to read them while deciding whether to apply - the `MixtureImportNotes`
// discipline from the dive form, raised to the whole logbook.
function ImportReportView({
  report,
  archive,
}: {
  report: ImportReport;
  archive: boolean;
}) {
  const totals = importTotals(report);
  const rows = report.collections.filter((row) => !collectionRowIsEmpty(row));
  const truncated = truncatedNotesSentence(report.notes_truncated);
  const hint = fileRestoreHint(report, archive);
  const conversion = report.conversion;
  const conversionTruncated = truncatedConversionSentence(
    conversion?.groups_truncated ?? 0,
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">What is in this file</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-2">
            No records at all — every collection in this document is empty.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Records by type, and what the import will do with each
              </caption>
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className="text-left font-medium py-1 pr-4">
                    Type
                  </th>
                  <th scope="col" className="text-right font-medium py-1 px-2">
                    New
                  </th>
                  <th scope="col" className="text-right font-medium py-1 px-2">
                    Already here
                  </th>
                  {/* Its own column, never folded into "New" or "Skipped": the API
                      keeps the four counts disjoint precisely so a diver restoring
                      a backup can see how much of it actually came back. */}
                  <th scope="col" className="text-right font-medium py-1 px-2">
                    Restored
                  </th>
                  <th scope="col" className="text-right font-medium py-1 pl-2">
                    Skipped
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.collection}>
                    <th
                      scope="row"
                      className="text-left font-normal py-1.5 pr-4"
                    >
                      {collectionLabel(row.collection)}
                    </th>
                    <td className="text-right tabular-nums py-1.5 px-2">
                      {row.created}
                    </td>
                    <td className="text-right tabular-nums py-1.5 px-2">
                      {row.linked}
                    </td>
                    <td className="text-right tabular-nums py-1.5 px-2">
                      {row.restored}
                    </td>
                    <td className="text-right tabular-nums py-1.5 pl-2">
                      {row.skipped}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border font-medium">
                <tr>
                  <th scope="row" className="text-left py-1.5 pr-4">
                    Total
                  </th>
                  <td className="text-right tabular-nums py-1.5 px-2">
                    {totals.created}
                  </td>
                  <td className="text-right tabular-nums py-1.5 px-2">
                    {totals.linked}
                  </td>
                  <td className="text-right tabular-nums py-1.5 px-2">
                    {totals.restored}
                  </td>
                  <td className="text-right tabular-nums py-1.5 pl-2">
                    {totals.skipped}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium">Uploaded files</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {report.files.referenced === 0
            ? "This document references no dive-computer files or certification scans."
            : `${report.files.referenced} referenced — ${report.files.restored} restored, ${report.files.not_contained} not in this file, ${report.files.skipped} skipped.`}
        </p>
        {hint && <p className="text-sm text-muted-foreground mt-1">{hint}</p>}
      </div>

      {report.notes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">Notes ({report.notes.length})</h3>
          <ul className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
            {report.notes.map((note, index) => (
              // Indexed because a note has no identifier of its own: `uuid` is the
              // record's and repeats across notes about one record, and `code`
              // repeats far more. The list is rebuilt wholesale from each response
              // and never reordered or filtered, so the index is stable for as
              // long as it is rendered.
              <li
                key={`${note.code}-${note.uuid ?? index}-${index}`}
                className={
                  noteIsWarning(note.code)
                    ? "text-sm text-amber-700 dark:text-amber-500"
                    : "text-sm text-muted-foreground"
                }
              >
                {note.collection && (
                  <span className="font-medium">
                    {collectionLabel(note.collection)}:{" "}
                  </span>
                )}
                {note.message}
              </li>
            ))}
          </ul>
          {truncated && (
            <p className="text-sm text-muted-foreground mt-2 italic">
              {truncated}
            </p>
          )}
        </div>
      )}

      {/* The fourth section, and the only one a native DiveJSON upload does not
          get: `conversion` is null there, and a heading saying nothing was lost
          would be a claim about a conversion that never happened. */}
      {conversion && (
        <div>
          <h3 className="text-sm font-medium">About the original file</h3>
          {conversion.groups.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">
              Everything in this {importSourceLabel(conversion.format)} file
              came across.
            </p>
          ) : (
            <ul className="mt-2 space-y-2 max-h-64 overflow-y-auto">
              {conversion.groups.map((group, index) => {
                const tone =
                  CONVERSION_TONE_CLASSES[conversionKindTone(group.kind)];
                return (
                  // Indexed for the same reason the notes list is: a group is
                  // identified by its `(kind, message)` pair and nothing else,
                  // and the list is rebuilt wholesale from each response.
                  <li
                    key={`${group.kind}-${index}`}
                    className={`text-sm ${tone.row}`}
                  >
                    <span
                      className={`inline-flex items-center rounded border px-1.5 py-0.5 mr-2 text-xs font-medium align-[1px] ${tone.badge}`}
                    >
                      {conversionKindLabel(group.kind)}
                    </span>
                    {group.message}
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {conversionWhereSentence(group)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {conversionTruncated && (
            <p className="text-sm text-muted-foreground mt-2 italic">
              {conversionTruncated}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// "Bring your logbook back" on the settings page, directly under the export card
// it is the other half of. The product's promise is that nothing in an account is
// locked to this app; export makes that falsifiable and import is what closes the
// loop, since a copy you cannot read back is a copy in name only.
//
// An import is two calls and one decision: preview reports what would happen and
// writes nothing, then apply commits it in a single transaction. The diver sees
// the plan first on purpose - an import that merged a stranger's logbook into
// theirs, or restored eight dives when they expected eighty, is not something to
// discover afterwards.
export function DataImportCard() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The file is held alongside the preview because apply needs *both* it and the
  // token: the API re-hashes the body and refuses a token minted for other bytes,
  // which is what stops an approved plan being applied to a different document.
  const [pending, setPending] = useState<{
    file: File;
    preview: ImportPreview;
  } | null>(null);
  const [result, setResult] = useState<ImportReport | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Checked here as well as by the API so a diver on a slow connection is not
      // made to upload a 400 MB archive before being told no. The API re-checks
      // regardless, and its check is the one that counts.
      const limit = isArchiveUpload(file)
        ? MAX_IMPORT_ARCHIVE_SIZE
        : MAX_IMPORT_DOCUMENT_SIZE;
      if (file.size > limit) {
        toast({
          title: "File too large",
          // Not "DiveJSON documents": the document bucket is what a `.fit` and
          // an `.ssrf` get too, and naming one format in a refusal about all of
          // them is how this card's copy has gone wrong before.
          description: `${isArchiveUpload(file) ? "Archives" : "Logbook files"} must be ${formatMegabytes(limit)} or smaller.`,
          variant: "destructive",
        });
        return;
      }

      setIsPreviewing(true);
      // A fresh pick supersedes whatever was on screen, so the old report goes
      // before the request rather than after it: a preview that fails must not
      // leave the previous file's counts standing under a new file's name.
      setPending(null);
      setResult(null);

      const preview = await logbookImportAPI.preview(file);
      setPending({ file, preview });
    } catch (error) {
      toast({
        title: "Could not read that file",
        description: getApiErrorMessage(
          error,
          // The fallback only shows when the API sent no `detail` of its own,
          // and its own 415 lists the formats this build reads - which is why
          // this one names none: a list written here would be a second copy of
          // one that moves with the API's converter pin.
          "The file could not be read as a logbook. Please check it and try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsPreviewing(false);
      // Reset so picking the *same* file again still fires `change`, which it
      // otherwise would not - the one thing that makes a retry after a failure
      // feel broken.
      e.target.value = "";
    }
  };

  const handleApply = async () => {
    if (!pending) return;

    try {
      setIsApplying(true);
      const applied = await logbookImportAPI.apply(
        pending.file,
        pending.preview.token,
      );
      setResult(applied);
      setPending(null);
      toast({
        title: "Logbook imported",
        description: "Your dives and everything linked to them are in.",
      });
    } catch (error) {
      toast({
        title: "Import failed",
        description: getApiErrorMessage(
          error,
          "The import could not be completed. Nothing has been changed.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const busy = isPreviewing || isApplying;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <HardDriveUpload className="h-5 w-5" />
          Bring a Logbook In
        </CardTitle>
        <CardDescription>
          Read a logbook back into this account — a backup you took here, a
          logbook from another copy of OpenDiving, or an export from Subsurface,
          a dive computer, the Suunto app or Suunto DM5. You see exactly what it
          would do before anything is written.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-dashed p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-muted/40">
          <div className="min-w-0">
            {/* The formats this sentence names are the ones
                `LOGBOOK_IMPORT_ACCEPT` offers, and the pairing is the point: a
                file the picker greys out has no business being listed here, and
                a format offered without being named reads as unsupported. */}
            <p className="font-medium text-sm">
              Choose a .divejson, .uddf, .ssrf, .fit, .json or .xml file, or a
              .zip
            </p>
            <p className="text-sm text-muted-foreground">
              Anything that is not DiveJSON already is converted on the way in,
              and you are told what the conversion could not carry. A .zip is
              either a full OpenDiving archive — which restores your
              dive-computer files and certification scans as well — or a folder
              of dive-computer files, read as one logbook. Records already in
              your logbook are matched rather than duplicated, and a dive you
              deleted comes back under its own identity.
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept={LOGBOOK_IMPORT_ACCEPT}
              className="hidden"
              onChange={handleFileSelected}
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              {isPreviewing ? (
                <div className="flex items-center space-x-2">
                  <ButtonSpinner />
                  <span>Reading...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Upload className="h-4 w-4" />
                  <span>Choose file</span>
                </div>
              )}
            </Button>
          </div>
        </div>

        {pending && (
          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <h3 className="font-medium">
                Ready to import {pending.file.name}
              </h3>
              {/* `importSourceSentence` reads `conversion` before `format` and
                  `generator`, which on a converted upload describe the document
                  the API ended up reading rather than the file just named above
                  it - "divejson 1.0, written by divejson convert" about
                  somebody's `.ssrf`. */}
              <p className="text-sm text-muted-foreground mt-1">
                {importSourceSentence(pending.preview)} Nothing has been written
                yet.
              </p>
            </div>

            <ImportReportView
              report={pending.preview}
              archive={pending.preview.archive}
            />

            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="button" onClick={handleApply} disabled={isApplying}>
                {isApplying ? (
                  <div className="flex items-center space-x-2">
                    <ButtonSpinner />
                    <span>Importing...</span>
                  </div>
                ) : (
                  <span>Import this logbook</span>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPending(null)}
                disabled={isApplying}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="rounded-lg border p-4 space-y-4">
            {/* `role="status"` so the outcome is announced rather than only
                drawn. It mounts with its text, which a screen reader typically
                does not read - the toast fired by `handleApply` is what carries
                the announcement, and this is the copy that stays put afterwards. */}
            <div role="status">
              <h3 className="font-medium">Imported</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Everything below has been written to your logbook.
              </p>
            </div>

            {/* `archive` is not on `ImportResult` - it is a property of the
                upload, which the preview reported and the result does not repeat.
                Passing `true` suppresses the "import the archive instead" hint,
                which would be advice about a decision already taken. */}
            <ImportReportView report={result} archive />

            <Button
              type="button"
              variant="outline"
              onClick={() => setResult(null)}
            >
              Done
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
