"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";
import { Download, Paperclip, Star, Trash2 } from "lucide-react";
import { CARD_SECTION_CONTENT, Card, CardContent } from "@/components/ui/card";
import { DiveCardHeader } from "@/components/dives/dive-card-header";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import {
  Dive,
  DiveFileInfo,
  diveFilePath,
  divesAPI,
  Recording,
} from "@/lib/api/dives";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  importSourceLabel,
  UNREAD_FILE_NOTE,
  UNREAD_FILE_PARSER_KEY,
} from "@/lib/api/logbook-import";
import {
  deleteRecordingConfirmation,
  diveRecordings,
  noFileKeptSentence,
  recordingDeviceLabel,
  recordingLabel,
  recordingReadoutsLabel,
  recordingSettingsLabel,
  UNNAMED_DEVICE_LABEL,
} from "@/lib/dive-recordings";
import { saveApiDownload } from "@/lib/download";
import { formatDiveTimeOnly } from "@/lib/date-time";
import { formatFileSize } from "@/lib/format";

interface DiveRecordingsCardProps {
  dive: Dive;
  // Called after anything here changes the dive, so the page can re-read it. A
  // delete can take a recording with it, promote the next one and re-derive what
  // the dive shows by default, so nothing here predicts the new state.
  onChanged: () => void | Promise<void>;
  /** Opens the Import section's edit dialog. */
  onEdit?: () => void;
}

/**
 * What recorded this dive, on the dive detail page: one block per recording,
 * with its device, what it was set to and what it reported, its own start where
 * that differs from the dive's, and its files to download.
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
  onEdit,
}: DiveRecordingsCardProps) {
  const { toast } = useToast();
  const [downloadingUuid, setDownloadingUuid] = useState<string | null>(null);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);
  // A recording with no files left, about to be deleted.
  const [removal, setRemoval] = useState<Recording | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const recordings = diveRecordings(dive);
  if (recordings.length === 0) return null;

  // Downloading goes through `saveApiDownload` rather than a plain `<a href>`: the
  // endpoint needs an `Authorization` header, which a link cannot send (the
  // access token lives in memory, not in a cookie). See `lib/download.ts`.
  //
  // The `v` param is the file's identity: `uuid` covers delete-then-reattach,
  // `updated_at` covers a replace. Without it the 5-minute `max-age` would keep
  // serving the previous file's bytes.
  const handleDownload = async (file: DiveFileInfo) => {
    try {
      setDownloadingUuid(file.uuid);
      await saveApiDownload(diveFilePath(dive.uuid, file.uuid), async () => ({
        blob: await divesAPI.getDiveFileBlob(
          dive.uuid,
          file.uuid,
          `${file.uuid}:${file.updated_at ?? ""}`,
        ),
        filename: file.original_filename,
      }));
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
      await divesAPI.deleteRecording(dive.uuid, removal.uuid);
      await onChanged();
      setRemoval(null);
      toast({
        title: "Recording deleted",
        description:
          "The recording and its profile were removed from this dive.",
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
      {/* Mounted only while a removal is pending, so the strings are derived
          from it rather than from a nullable one. */}
      {removal && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRemoval(null)}
          {...deleteRecordingConfirmation(recordings, removal.uuid)}
          confirmText="Delete"
          isLoading={isRemoving}
          onConfirm={confirmRemoval}
        />
      )}

      <Card>
        <DiveCardHeader group="Import" title="Recordings" onEdit={onEdit} />
        <CardContent className={cn(CARD_SECTION_CONTENT, "space-y-6")}>
          {recordings.map((recording) => {
            const device = recordingDeviceLabel(recording.device);
            // What this computer was set to, where the file said: its mode and
            // its decompression model. On the recording rather than on the dive,
            // because a backup run in gauge mode does not make the dive a gauge
            // dive - and absent entirely rather than guessed, which is why there
            // is no "Open circuit" here on a file that recorded no mode.
            const settings = recordingSettingsLabel(recording);
            // Its own CNS, OTU and surface pressure. Every recording's, not just
            // the primary's the exposure card shows: two computers give two
            // answers, and this is the one place both are on screen.
            const readouts = recordingReadoutsLabel(recording);
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
                  {settings && (
                    <div
                      data-testid="dive-recording-settings"
                      className="text-sm text-muted-foreground"
                    >
                      {settings}
                    </div>
                  )}
                  {readouts && (
                    <div
                      data-testid="dive-recording-readouts"
                      className="text-sm text-muted-foreground"
                    >
                      {readouts}
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
                          <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium break-all">
                              {file.original_filename}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {importSourceLabel(file.parser_key)} &middot;{" "}
                              {formatFileSize(file.byte_size)}
                            </div>
                            {file.parser_key === UNREAD_FILE_PARSER_KEY && (
                              <div className="text-xs text-muted-foreground">
                                {UNREAD_FILE_NOTE}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Named by the file rather than by the verb: a dive
                            with two recordings and three files between them
                            renders three of these, and "Download, Download..."
                            names none of them. Removing a file is the edit
                            dialog's, beside importing one. */}
                        <IconTooltip
                          label={`Download ${file.original_filename}`}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="shrink-0"
                            onClick={() => handleDownload(file)}
                            disabled={downloadingUuid === file.uuid}
                          >
                            {downloadingUuid === file.uuid ? (
                              <ButtonSpinner />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        </IconTooltip>
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
                        <ButtonSpinner className="mr-2" />
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
                      onClick={() => setRemoval(recording)}
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
