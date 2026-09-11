"use client";

import { useState } from "react";
import { Download, FileText, Loader2, Star, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import {
  Dive,
  DiveFileInfo,
  divesAPI,
  diveParserLabel,
  Recording,
} from "@/lib/api/dives";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  diveRecordings,
  noFileKeptSentence,
  recordingDeviceLabel,
  recordingLabel,
  UNNAMED_DEVICE_LABEL,
} from "@/lib/dive-recordings";
import { downloadBlob } from "@/lib/download";
import { formatDiveTimeOnly } from "@/lib/date-time";
import { formatFileSize } from "@/lib/format";

interface DiveRecordingsCardProps {
  dive: Dive;
  // Called after anything here changes the dive, so the page can re-read it. A
  // delete can take a recording with it, promote the next one and re-derive the
  // dive's oxygen-exposure readings, so nothing here predicts the new state.
  onChanged: () => void | Promise<void>;
}

// What the diver is about to remove, and by which route. A file and a whole
// recording are different requests with different consequences, and the dialog
// has to say which one it is about.
type PendingRemoval =
  | { kind: "file"; recording: Recording; file: DiveFileInfo }
  | { kind: "recording"; recording: Recording };

/**
 * What recorded this dive, on the dive detail page: one block per recording,
 * with its device, its own start where that differs from the dive's, and its
 * files to download or delete.
 *
 * Renders nothing when the dive has no recordings at all - most dives are logged
 * by hand, and there is no empty state worth showing for a thing the diver
 * deliberately did not do.
 *
 * This was the *Imported From* card, which showed one file because a dive had
 * one. A dive now has an ordered list of recordings, each with its own device
 * and its own files, and the two facts this card exists to state are which
 * computers recorded the dive and what the account still holds from each.
 */
export function DiveRecordingsCard({
  dive,
  onChanged,
}: DiveRecordingsCardProps) {
  const { toast } = useToast();
  const [downloadingUuid, setDownloadingUuid] = useState<string | null>(null);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);
  const [removal, setRemoval] = useState<PendingRemoval | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const recordings = diveRecordings(dive);
  if (recordings.length === 0) return null;

  // Downloading goes through the API client rather than a plain `<a href>`: the
  // endpoint needs an `Authorization` header, which a link cannot send (the
  // access token lives in memory, not in a cookie). See `lib/download.ts` for why
  // the object URL outlives the click.
  //
  // The `v` param is the file's identity: `uuid` covers delete-then-reattach,
  // `updated_at` covers a replace. Without it the 5-minute `max-age` would keep
  // serving the previous file's bytes.
  const handleDownload = async (file: DiveFileInfo) => {
    try {
      setDownloadingUuid(file.uuid);
      const blob = await divesAPI.getDiveFileBlob(
        dive.uuid,
        file.uuid,
        `${file.uuid}:${file.updated_at ?? ""}`,
      );
      downloadBlob(blob, file.original_filename);
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to download the file. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setDownloadingUuid(null);
    }
  };

  const handleMakePrimary = async (recording: Recording) => {
    try {
      setBusyUuid(recording.uuid);
      await divesAPI.makeRecordingPrimary(dive.uuid, recording.uuid);
      await onChanged();
      toast({
        title: "Shown by default",
        description:
          "This recording now supplies the dive's figures and its charted profile.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to change which recording is shown. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setBusyUuid(null);
    }
  };

  const confirmRemoval = async () => {
    if (!removal) return;
    try {
      setIsRemoving(true);
      if (removal.kind === "file") {
        await divesAPI.deleteDiveFile(dive.uuid, removal.file.uuid);
      } else {
        await divesAPI.deleteRecording(dive.uuid, removal.recording.uuid);
      }
      await onChanged();
      setRemoval(null);
      toast({
        title: removal.kind === "file" ? "File deleted" : "Recording deleted",
        description:
          removal.kind === "file"
            ? "The file was removed from this dive."
            : "The recording and its profile were removed from this dive.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to delete. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const namesRecordings = recordings.length > 1;

  return (
    <>
      <ConfirmDialog
        open={removal !== null}
        onOpenChange={(open) => !open && setRemoval(null)}
        title={
          removal?.kind === "recording"
            ? "Delete this recording?"
            : "Delete this file?"
        }
        description={
          removal?.kind === "recording"
            ? "The recording, its profile and any files it holds will be permanently deleted. This cannot be undone, and the dive itself is unaffected."
            : "The file will be permanently deleted, and this recording's profile is re-read from whatever files are left. This cannot be undone, and the dive itself is unaffected."
        }
        confirmText="Delete"
        isLoading={isRemoving}
        onConfirm={confirmRemoval}
      />

      <Card>
        <CardHeader>
          <CardTitle as="h2">Recordings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {recordings.map((recording) => {
            const device = recordingDeviceLabel(recording.device);
            const noFileKept = noFileKeptSentence(recording);
            // Its own start, but only where it says something the dive's start
            // does not: a second computer that entered the water a minute later
            // is worth a line, and the primary recording agreeing with the dive
            // is not.
            const ownStart =
              recording.started_at && recording.started_at !== dive.start_time
                ? formatDiveTimeOnly(recording.started_at)
                : null;

            return (
              <div
                key={recording.uuid}
                data-testid="dive-recording"
                className="space-y-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium break-words">
                    {device ?? UNNAMED_DEVICE_LABEL}
                  </div>
                  {namesRecordings && (
                    <div className="text-xs text-muted-foreground">
                      {recordingLabel(recording)}
                      {recording.ordinal === 0 ? " · shown by default" : ""}
                    </div>
                  )}
                  {ownStart && (
                    <div className="text-sm text-muted-foreground">
                      Started {ownStart}
                    </div>
                  )}
                  {recording.device?.firmware && (
                    <div className="text-xs text-muted-foreground">
                      Firmware {recording.device.firmware}
                    </div>
                  )}
                </div>

                {noFileKept ? (
                  <p className="text-sm text-muted-foreground">{noFileKept}</p>
                ) : (
                  <ul className="space-y-2">
                    {recording.files.map((file) => (
                      <li
                        key={file.uuid}
                        data-testid="dive-recording-file"
                        className="flex items-start justify-between gap-2 rounded-md border px-3 py-2"
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium break-all">
                              {file.original_filename}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {diveParserLabel(file.parser_key)} &middot;{" "}
                              {formatFileSize(file.byte_size)}
                            </div>
                          </div>
                        </div>
                        {/* Both named by the file rather than by the verb: a
                            dive with two recordings and three files between them
                            renders six of these, and a controls list reading
                            "Download, Delete, Download, Delete..." names none of
                            them. */}
                        <div className="flex shrink-0 items-center">
                          <IconTooltip
                            label={`Download ${file.original_filename}`}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload(file)}
                              disabled={downloadingUuid === file.uuid}
                            >
                              {downloadingUuid === file.uuid ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </IconTooltip>
                          <IconTooltip
                            label={`Delete ${file.original_filename}`}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setRemoval({ kind: "file", recording, file })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </IconTooltip>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2">
                  {recording.ordinal !== 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleMakePrimary(recording)}
                      disabled={busyUuid === recording.uuid}
                    >
                      {busyUuid === recording.uuid ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Star className="h-4 w-4 mr-2" />
                      )}
                      Show by default
                    </Button>
                  )}
                  {/* A recording with no files has no per-file delete control,
                      and the recording route is the only way to remove it at
                      all - so without this a converter-imported or merged
                      recording would be permanent. Offered only in that case:
                      where there are files, deleting them one at a time is the
                      smaller action, and the server removes the recording with
                      the last of them. */}
                  {noFileKept && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRemoval({ kind: "recording", recording })
                      }
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete recording
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
