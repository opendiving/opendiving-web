"use client";

import { useRef, useState } from "react";

import { ImportDropZone } from "@/components/import/import-drop-zone";
import {
  ImportFileList,
  type SelectedImportFile,
} from "@/components/import/import-file-list";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Meter } from "@/components/ui/meter";
import { Progress } from "@/components/ui/progress";
import { StatusMessage } from "@/components/ui/status-message";
import { getApiErrorMessage, getApiErrorStatus } from "@/lib/api/error";
import {
  logbookImportAPI,
  MAX_IMPORT_DOCUMENT_SIZE,
  type LogbookImportRead,
} from "@/lib/api/logbook-import";
import type { WalkedDrop } from "@/lib/dropped-files";
import { formatFileSize } from "@/lib/format";
import {
  importFileRefusal,
  importSelectionRefusal,
  isHiddenImportPath,
  isZipFile,
} from "@/lib/logbook-import";

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

interface ImportPickerProps {
  onCreated: (created: LogbookImportRead) => void;
  /** Looks for the pending import a refused upload named. */
  onOpenPending: () => void;
}

// The files of a new import, and the one upload that sends them.
export function ImportPicker({ onCreated, onOpenPending }: ImportPickerProps) {
  const nextId = useRef(0);

  const [files, setFiles] = useState<SelectedImportFile[]>([]);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Whether the upload was refused for an import already pending.
  const [refused, setRefused] = useState(false);
  // What the browser could not read out of the last drop, which never reached
  // the selection and so has no row to say so.
  const [unreadable, setUnreadable] = useState<string[]>([]);

  const [walking, setWalking] = useState(false);
  const uploading = transfer !== null;
  const busy = uploading || walking;
  const sendable = files.filter((item) => item.refusal === null);
  const selectionRefusal = importSelectionRefusal(
    sendable.map((item) => item.file),
  );
  const unzippedBytes = sendable
    .filter((item) => !isZipFile(item.file))
    .reduce((sum, item) => sum + item.file.size, 0);

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
    setError(null);
  };

  const removeFile = (id: number) => {
    setFiles((current) => current.filter((item) => item.id !== id));
    setError(null);
  };

  const upload = async () => {
    setError(null);
    setRefused(false);
    setTransfer({
      sent: 0,
      total: sendable.reduce((sum, item) => sum + item.file.size, 0),
    });
    try {
      onCreated(
        await logbookImportAPI.create(
          sendable.map((item) => item.file),
          (sent, total) => setTransfer({ sent, total }),
        ),
      );
    } catch (caught) {
      setRefused(getApiErrorStatus(caught) === 409);
      setError(
        getApiErrorMessage(
          caught,
          // Shown only when the API sent no `detail` - a proxy's bare 413 among
          // them. The API's own refusals name the formats and the bounds.
          "The files could not be read. Please check them and try again.",
        ),
      );
    } finally {
      setTransfer(null);
    }
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="import-files-heading" className="space-y-3">
        <h2 id="import-files-heading" className="sr-only">
          Files
        </h2>
        <ImportDropZone
          disabled={busy}
          onFiles={addFiles}
          onWalking={setWalking}
        />
        {unreadable.length > 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            {`The browser could not read ${unreadable.length === 1 ? "this from the drop" : `these ${unreadable.length} from the drop`}, so ${unreadable.length === 1 ? "it was" : "they were"} left out: ${unreadable.join(", ")}.`}
          </p>
        )}

        {files.length > 0 && (
          <>
            <ImportFileList
              files={files}
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
            <StatusMessage variant="error">{selectionRefusal}</StatusMessage>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={upload}
                disabled={
                  busy || sendable.length === 0 || selectionRefusal !== null
                }
              >
                Upload
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFiles([]);
                  setError(null);
                  setRefused(false);
                }}
                disabled={busy}
              >
                Remove all
              </Button>
            </div>
          </>
        )}

        {transfer && <UploadProgress transfer={transfer} />}
      </section>

      <StatusMessage variant="error">{error}</StatusMessage>

      {refused && (
        <Button type="button" variant="outline" onClick={onOpenPending}>
          Open the pending import
        </Button>
      )}
    </div>
  );
}
