"use client";

import { useState } from "react";
import { FileText, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/tooltip";
import type { Recording } from "@/lib/api/dives";
import {
  deleteFileConfirmation,
  diveFileRows,
  UNNAMED_DEVICE_LABEL,
  type DiveFileRow,
  type RecordingConfirmation,
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
   * The uuids of stored files the diver has marked for deletion. Their rows stay
   * on the list, struck through, until the edit is saved.
   */
  removedStored?: string[];
  /**
   * Marks one stored file for deletion, behind this component's confirm dialog.
   * **Nothing is sent until the form is saved** - the page collects these the
   * way it collects `pending`, so that Cancel leaves the dive exactly as it
   * found it. Absent on the create form, where every row is pending and removal
   * is local anyway.
   */
  onRemoveStored?: (fileUuid: string) => void;
  /** Takes a marked file back off the list. */
  onRestoreStored?: (fileUuid: string) => void;
}

/**
 * The confirmation before striking a stored file off the list.
 *
 * **It only describes an outcome while it is the first thing struck off**, and
 * that limit is the point rather than a gap. `deleteFileConfirmation` tells the
 * three outcomes apart — the recording keeps its other files, it survives
 * file-less, or it goes with the file — by reading the dive as the server holds
 * it, and the immediate delete this replaces kept that true for free by
 * re-reading after every one. Nothing re-reads now, so from the second mark on,
 * the answer depends on a cascade that happens on the server when the save runs:
 * a recording emptied by an earlier mark is deleted, its profile is re-derived
 * from whatever files are left (which turns a merge's unreproducible samples
 * into reproducible ones), and the ordinals are renumbered, moving which
 * recording the dive reads its computer figures from.
 *
 * Three rounds of review found three different ways for a local model of that to
 * be wrong, each in a dialog whose whole job is to be right about a destructive
 * action, so there is no local model: past the first mark this says what is
 * certain and stops. `deleteFileConfirmation` itself is untouched — the dive
 * page's recordings card shares it, and there the delete really is immediate and
 * the re-read really does happen.
 */
function removeFileConfirmation(
  recordings: Recording[],
  fileUuid: string,
  othersAlreadyMarked: boolean,
): RecordingConfirmation {
  if (othersAlreadyMarked) {
    return {
      title: "Delete this file?",
      description:
        "It is permanently deleted when you save, along with the others you have struck off. Between them they may leave a recording with no files, and a recording with nothing left to re-read is deleted with its profile and its samples — so what this dive shows can change. Nothing happens until you save; until then the row stays on the list, marked, and you can put it back.",
    };
  }

  const confirmation = deleteFileConfirmation(recordings, fileUuid);
  return {
    title: confirmation.title,
    description: `${confirmation.description} None of it happens until you save this edit - until then the row stays on the list, marked, and you can put it back.`,
  };
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
  removedStored = [],
  onRemoveStored,
  onRestoreStored,
}: DiveRecordingFilesProps) {
  // The file uuid awaiting confirmation, or null. Kept here rather than in the
  // page because the dialog is this list's, and the page has no reason to know
  // which row the pointer is over.
  const [pendingDeletion, setPendingDeletion] = useState<DiveFileRow | null>(
    null,
  );

  const removed = new Set(removedStored);
  const storedRows = diveFileRows(recordings);
  if (storedRows.length === 0 && pending.length === 0) return null;

  const confirmDelete = () => {
    if (!pendingDeletion || pendingDeletion.kind !== "file" || !onRemoveStored)
      return;
    onRemoveStored(pendingDeletion.file.uuid);
    setPendingDeletion(null);
  };

  return (
    <>
      {/* Three outcomes sit behind one Trash icon - the recording keeps its
          other files, it survives file-less because nothing could re-read its
          samples, or **it is deleted along with the file** - and they differ in
          what the dive shows afterwards. `deleteFileConfirmation` is the single
          place that decides which, shared with the recordings card on the dive
          page so two routes to one endpoint cannot drift apart.

          Mounted only while a row is pending, so both strings come from that
          row: the nullable-prop idiom used elsewhere would let the heading fall
          back to a neutral "Delete this file?" as the dialog closed, which is
          the wrong half of the very difference this draws. */}
      {pendingDeletion?.kind === "file" && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingDeletion(null)}
          {...removeFileConfirmation(
            recordings,
            pendingDeletion.file.uuid,
            removed.size > 0,
          )}
          confirmText="Delete"
          onConfirm={confirmDelete}
        />
      )}

      <ul className="mt-3 space-y-2" data-testid="dive-file-list">
        {storedRows.map((row) => (
          <FileRow
            key={row.key}
            row={row}
            isRemoved={row.kind === "file" && removed.has(row.file.uuid)}
            onDelete={
              row.kind === "file" && onRemoveStored
                ? () => setPendingDeletion(row)
                : undefined
            }
            onRestore={
              row.kind === "file" && onRestoreStored
                ? () => onRestoreStored(row.file.uuid)
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
  isRemoved = false,
  onDelete,
  onRestore,
}: {
  row: DiveFileRow;
  /** Marked for deletion on save - struck through rather than taken off the list. */
  isRemoved?: boolean;
  onDelete?: () => void;
  onRestore?: () => void;
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
        isRemoved
          ? onRestore && (
              <IconTooltip label={`Keep ${row.file.original_filename}`}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onRestore}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </IconTooltip>
            )
          : onDelete && (
              // The file name rather than "Delete": this list has one of these per
              // row, and a screen reader reading them out gets a column of
              // identical names otherwise.
              <IconTooltip label={`Delete ${row.file.original_filename}`}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </IconTooltip>
            )
      }
    >
      <div
        className={
          isRemoved
            ? "text-sm font-medium break-all text-muted-foreground line-through"
            : "text-sm font-medium break-all"
        }
      >
        {row.file.original_filename}
      </div>
      <div className="text-sm text-muted-foreground break-words">
        {device}
        {row.recordingName ? ` · ${row.recordingName}` : ""}
      </div>
      <div className="text-xs text-muted-foreground">
        {/* The strike-through alone is a colour-and-decoration claim about a
            row that is otherwise unchanged, so the state is also in words -
            beside the pending rows, which say the mirror-image thing. */}
        {isRemoved
          ? "Deleted when you save"
          : `${row.parserLabel ? `${row.parserLabel} · ` : ""}${formatFileSize(row.file.byte_size)}`}
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
