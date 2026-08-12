"use client";

import { useState } from "react";
import { Download, FileText, Loader2, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Dive, divesAPI, diveParserLabel } from "@/lib/api/dives";
import { getApiErrorMessage } from "@/lib/api/error";
import { downloadBlob } from "@/lib/download";
import { formatFileSize } from "@/lib/format";

interface DiveSourceFileCardProps {
  dive: Dive;
  // Called after the file is deleted, so the caller can refetch the dive and
  // drop the now-stale `source_file` it embeds.
  onChanged: () => void | Promise<void>;
}

// Shows the dive-computer export a dive was imported from, on the dive detail
// page. Renders nothing when there isn't one - most dives are logged by hand.
export function DiveSourceFileCard({
  dive,
  onChanged,
}: DiveSourceFileCardProps) {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const file = dive.source_file;
  if (!file) return null;

  // Downloading goes through the API client rather than a plain `<a href>`: the
  // endpoint needs an `Authorization` header, which a link cannot send (the
  // access token lives in memory, not in a cookie). See `lib/download.ts` for why
  // the object URL outlives the click.
  //
  // The `v` param is the file's identity: `uuid` covers delete-then-reattach,
  // `updated_at` covers a replace. Without it the 5-minute `max-age` would keep
  // serving the previous file's bytes after a replace.
  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      const blob = await divesAPI.getDiveFileBlob(
        dive.uuid,
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
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await divesAPI.deleteDiveFile(dive.uuid);
      await onChanged();

      toast({
        title: "File deleted",
        description: "The imported file was removed from this dive.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to delete the file. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setIsConfirmOpen(false);
    }
  };

  return (
    <>
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title="Delete imported file?"
        description="The file will be permanently deleted. This cannot be undone, and the dive itself is unaffected."
        confirmText="Delete"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />

      <Card>
        <CardHeader>
          <CardTitle>Imported From</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium break-all">
                {file.original_filename}
              </div>
              <div className="text-sm text-muted-foreground">
                {diveParserLabel(file.parser_key)} &middot;{" "}
                {formatFileSize(file.byte_size)}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsConfirmOpen(true)}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
