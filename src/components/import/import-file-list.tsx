"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { formatFileSize } from "@/lib/format";

/** A file in the selection, and why the client leaves it out, if it does. */
export interface SelectedImportFile {
  id: number;
  file: File;
  /** Its name under the folders it was dropped inside. */
  path: string;
  /** Why the API certainly would refuse it; such a file is not sent. */
  refusal: string | null;
}

interface ImportFileListProps {
  files: readonly SelectedImportFile[];
  disabled: boolean;
  onRemove: (id: number) => void;
}

// The selection, one row per picked file, each with a remove control named with
// its file - the shape the dive form's pending rows have.
export function ImportFileList({
  files,
  disabled,
  onRemove,
}: ImportFileListProps) {
  return (
    <ul className="divide-y divide-border rounded-md border">
      {files.map((item) => (
        <li key={item.id} className="flex items-start gap-3 px-3 py-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="text-sm font-medium break-all">{item.path}</div>
            <div className="text-xs text-muted-foreground">
              {formatFileSize(item.file.size)}
            </div>
            {item.refusal && (
              <div className="text-xs text-destructive break-words">
                {`Refused: ${item.refusal}`}
              </div>
            )}
          </div>
          <IconTooltip label={`Remove ${item.path}`}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(item.id)}
              disabled={disabled}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </IconTooltip>
        </li>
      ))}
    </ul>
  );
}
