"use client";

import { useState } from "react";
import { divesAPI, type Recording } from "@/lib/api/dives";
import { getApiErrorMessage } from "@/lib/api/error";
import type { PendingDiveFile } from "@/components/dives/dive-recording-files";
import { useToast } from "@/components/ui/use-toast";

/** What `DiveFileImport` takes to list a dive's files and change them. */
export interface DiveFileListProps {
  onFileAdded: (pending: PendingDiveFile) => void;
  pending: PendingDiveFile[];
  onRemovePending: (id: string) => void;
  removedStored: string[];
  onRemoveStored: (fileUuid: string) => void;
  onRestoreStored: (fileUuid: string) => void;
}

export interface SaveDiveFilesOptions {
  /** Leads each failure's title with what did save, e.g. "Dive updated, but ". */
  saved?: string;
  /** A failed attach's description when the API gives no reason. */
  attachFallback?: string;
}

/**
 * The files a dive form has picked and struck off, held until the dive is saved: a
 * picked file can only be attached once the dive exists, and a stored one is deleted
 * in the same pass rather than when it is struck off, so that Cancel leaves the dive's
 * files as it found them - see "The edit forms delete a stored file on save" in
 * DECISIONS.md.
 *
 * `recordings` are the dive's stored files, which name a struck-off file in a
 * failure toast.
 */
export function usePendingDiveFiles(recordings: readonly Recording[] = []) {
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingDiveFile[]>([]);
  const [removedStored, setRemovedStored] = useState<string[]>([]);

  const fileList: DiveFileListProps = {
    onFileAdded: (item) => setPending((files) => [...files, item]),
    pending,
    onRemovePending: (id) =>
      setPending((files) => files.filter((item) => item.id !== id)),
    removedStored,
    onRemoveStored: (fileUuid) =>
      setRemovedStored((uuids) =>
        uuids.includes(fileUuid) ? uuids : [...uuids, fileUuid],
      ),
    onRestoreStored: (fileUuid) =>
      setRemovedStored((uuids) => uuids.filter((uuid) => uuid !== fileUuid)),
  };

  // The uuid is the fallback for a dive re-read out from under the form.
  const storedName = (fileUuid: string) =>
    recordings
      .flatMap((recording) => recording.files)
      .find((file) => file.uuid === fileUuid)?.original_filename ?? "a file";

  /**
   * Deletes what was struck off, then attaches what was picked, once the dive itself
   * has saved. Removals first, so each attach lands beside the rows the diver was
   * looking at. Attaches one at a time and in pick order: the API decides per file
   * which recording it joins, and racing two would make that depend on arrival order.
   *
   * Each failure is its own toast and none stops the next. The dive is saved either
   * way, and a file left behind is a smaller loss than a save made twice - the 409 of
   * an export already on another dive, the 422 of an expired import and the 413 of a
   * storage limit all arrive here in the API's own words.
   */
  const save = async (
    diveUuid: string,
    {
      saved = "",
      attachFallback = "Try importing the file again.",
    }: SaveDiveFilesOptions = {},
  ) => {
    for (const fileUuid of removedStored) {
      try {
        await divesAPI.deleteDiveFile(diveUuid, fileUuid);
      } catch (error) {
        console.error("Failed to delete the dive file:", error);
        toast({
          title: `${saved}${storedName(fileUuid)} wasn't deleted`,
          description: getApiErrorMessage(
            error,
            "Try removing the file again.",
          ),
          variant: "destructive",
        });
      }
    }
    for (const item of pending) {
      try {
        await divesAPI.attachRecordingFile(diveUuid, item.file, item.token);
      } catch (error) {
        console.error("Failed to attach the dive file:", error);
        toast({
          title: `${saved}${item.file.name} wasn't attached`,
          description: getApiErrorMessage(error, attachFallback),
          variant: "destructive",
        });
      }
    }
  };

  return {
    fileList,
    hasChanges: pending.length > 0 || removedStored.length > 0,
    save,
  };
}
