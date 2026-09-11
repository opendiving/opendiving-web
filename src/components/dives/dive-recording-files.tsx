"use client";

import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/tooltip";
import type { Recording } from "@/lib/api/dives";
import {
  diveFileRows,
  UNNAMED_DEVICE_LABEL,
  type DiveFileRow,
} from "@/lib/dive-recordings";
import { formatFileSize } from "@/lib/format";

/**
 * A file the diver has picked and the API has parsed, waiting for a dive to
 * exist (create form) or for the edit to be saved (edit form).
 *
 * The page holds these, not this component: `/dive/parse` stores nothing, so
 * there is nowhere to send a file until the save succeeds, and importing a file
 * and then cancelling the edit must not change the dive's stored exports.
 */
export interface PendingDiveFile {
  /** Identity for the list and for removal; the `File` itself is not unique. */
  id: string;
  file: File;
  /** The `file_token` proving the API parsed these exact bytes for this user. */
  token: string;
  /** What the parse said recorded it, already rendered. */
  deviceLabel: string | null;
}

interface DiveRecordingFilesProps {
  /** What the dive already holds. Empty on the create form, where nothing is stored yet. */
  recordings: Recording[];
  pending: PendingDiveFile[];
  onRemovePending: (id: string) => void;
  /**
   * Deletes one stored file, behind this component's confirm dialog. Absent on
   * the create form, where every row is pending and removal is local.
   */
  onDeleteStored?: (fileUuid: string) => Promise<void>;
}

/**
 * The list of files attached to a dive, on both dive forms: what is stored, what
 * is about to be, and which computer each came off.
 *
 * **Every row is one box with a delete control inside it**, and a recording that
 * kept no file gets a row of its own saying so. Both are statements about what
 * the account holds: a diver looking at this list is checking whether their
 * files are still there, and a device that silently has no row is the thing that
 * would read as data loss.
 *
 * Renders nothing at all when there is neither a stored file nor a pending one —
 * a dive logged by hand has no list to show, and an empty box under the picker
 * would only be a place for the eye to stop.
 */
export function DiveRecordingFiles({
  recordings,
  pending,
  onRemovePending,
  onDeleteStored,
}: DiveRecordingFilesProps) {
  // The file uuid awaiting confirmation, or null. Kept here rather than in the
  // page because the dialog is this list's, and the page has no reason to know
  // which row the pointer is over.
  const [pendingDeletion, setPendingDeletion] = useState<DiveFileRow | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const storedRows = diveFileRows(recordings);
  if (storedRows.length === 0 && pending.length === 0) return null;

  const confirmDelete = async () => {
    if (!pendingDeletion || pendingDeletion.kind !== "file" || !onDeleteStored)
      return;
    try {
      setIsDeleting(true);
      await onDeleteStored(pendingDeletion.file.uuid);
      setPendingDeletion(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <ConfirmDialog
        open={pendingDeletion !== null}
        onOpenChange={(open) => !open && setPendingDeletion(null)}
        title="Delete this file?"
        // Says what else goes with it, because on this route that is not
        // obvious: the API re-derives the recording's profile from whatever
        // files are left, and deleting the last one of a file-backed recording
        // takes the recording with it.
        description="The file will be permanently deleted, and this recording's profile is re-read from whatever files are left. This cannot be undone."
        confirmText="Delete"
        isLoading={isDeleting}
        onConfirm={confirmDelete}
      />

      <ul className="mt-3 space-y-2" data-testid="dive-file-list">
        {storedRows.map((row) => (
          <FileRow
            key={row.key}
            row={row}
            onDelete={
              row.kind === "file" && onDeleteStored
                ? () => setPendingDeletion(row)
                : undefined
            }
          />
        ))}
        {pending.map((item) => (
          <PendingRow
            key={item.id}
            item={item}
            onRemove={() => onRemovePending(item.id)}
          />
        ))}
      </ul>
    </>
  );
}

// One row's box. Shared by both kinds so a stored file and a pending one line up
// down the list instead of each inventing its own padding.
function Row({
  children,
  action,
}: {
  children: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <li
      data-testid="dive-file-row"
      className="flex items-start justify-between gap-2 rounded-md border px-3 py-2"
    >
      <div className="flex min-w-0 items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">{children}</div>
      </div>
      {action}
    </li>
  );
}

function FileRow({
  row,
  onDelete,
}: {
  row: DiveFileRow;
  onDelete?: () => void;
}) {
  const device = row.deviceLabel ?? UNNAMED_DEVICE_LABEL;

  if (row.kind === "empty") {
    return (
      <Row action={null}>
        <div className="text-sm font-medium break-words">{device}</div>
        {row.recordingName && (
          <div className="text-xs text-muted-foreground">
            {row.recordingName}
          </div>
        )}
        <div className="text-sm text-muted-foreground">{row.reason}</div>
      </Row>
    );
  }

  return (
    <Row
      action={
        onDelete && (
          // The file name rather than "Delete": this list has one of these per
          // row, and a screen reader reading them out gets a column of
          // identical names otherwise.
          <IconTooltip label={`Delete ${row.file.original_filename}`}>
            <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </IconTooltip>
        )
      }
    >
      <div className="text-sm font-medium break-all">
        {row.file.original_filename}
      </div>
      <div className="text-sm text-muted-foreground break-words">
        {device}
        {row.recordingName ? ` · ${row.recordingName}` : ""}
      </div>
      <div className="text-xs text-muted-foreground">
        {row.parserLabel ? `${row.parserLabel} · ` : ""}
        {formatFileSize(row.file.byte_size)}
      </div>
    </Row>
  );
}

function PendingRow({
  item,
  onRemove,
}: {
  item: PendingDiveFile;
  onRemove: () => void;
}) {
  return (
    <Row
      action={
        <IconTooltip label={`Remove ${item.file.name}`}>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </IconTooltip>
      }
    >
      <div className="text-sm font-medium break-all">{item.file.name}</div>
      <div className="text-sm text-muted-foreground break-words">
        {item.deviceLabel ?? UNNAMED_DEVICE_LABEL}
      </div>
      <div className="text-xs text-muted-foreground">
        Will be attached when you save · {formatFileSize(item.file.size)}
      </div>
    </Row>
  );
}
