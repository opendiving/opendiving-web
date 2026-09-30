"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import {
  importSourceLabel,
  type ImportMemberReport,
} from "@/lib/api/logbook-import";
import { formatFileSize } from "@/lib/format";
import { importMemberNotKeptSentence } from "@/lib/logbook-import";

/** A file in the selection, and why the client leaves it out, if it does. */
export interface SelectedImportFile {
  id: number;
  file: File;
  /** Its name under the folders it was dropped inside. */
  path: string;
  /** Why the API certainly would refuse it; such a file is not sent. */
  refusal: string | null;
}

// What the API read one file as, and what becomes of it.
function memberStatus(member: ImportMemberReport): {
  text: string;
  refused: boolean;
} {
  if (member.refusal) return { text: member.refusal, refused: true };
  if (member.format === null) return { text: "Not read", refused: false };
  const format = importSourceLabel(member.format);
  if (member.format === "zip") {
    const opened = member.opened ?? 0;
    return {
      text: `${format} · opened into ${opened === 1 ? "1 file" : `${opened} files`}`,
      refused: false,
    };
  }
  if (member.kept)
    return { text: `${format} · kept on its dive`, refused: false };
  return {
    text: member.not_kept
      ? `${format} · ${importMemberNotKeptSentence(member.not_kept)}`
      : format,
    refused: false,
  };
}

function StatusLine({ text, refused }: { text: string; refused: boolean }) {
  return (
    <div
      className={
        refused
          ? "text-xs text-destructive break-words"
          : "text-xs text-muted-foreground break-words"
      }
    >
      {refused ? `Refused: ${text}` : text}
    </div>
  );
}

interface ImportFileListProps {
  files: readonly SelectedImportFile[];
  /** The members of the plan on screen, or empty before a read. */
  members: readonly ImportMemberReport[];
  /** Each sent file's `members` row by its part index - the files sent, in order. */
  sent: readonly SelectedImportFile[];
  disabled: boolean;
  onRemove: (id: number) => void;
}

// The selection, one row per picked file, each with a remove control named with
// its file - the shape the dive form's pending rows have. Once read, each row
// says what the API read it as and whether it is kept; a zip's row lists the
// files it opened into beneath it.
export function ImportFileList({
  files,
  members,
  sent,
  disabled,
  onRemove,
}: ImportFileListProps) {
  return (
    <ul className="divide-y divide-border rounded-md border">
      {files.map((item) => {
        const part = sent.indexOf(item);
        const rowIndex = members.findIndex(
          (member) => member.part === part && member.container === null,
        );
        const member = rowIndex >= 0 ? members[rowIndex] : null;
        const inside =
          rowIndex >= 0
            ? members.filter((candidate) => candidate.container === rowIndex)
            : [];
        return (
          <li key={item.id} className="flex items-start gap-3 px-3 py-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="text-sm font-medium break-all">{item.path}</div>
              <div className="text-xs text-muted-foreground">
                {formatFileSize(item.file.size)}
              </div>
              {item.refusal ? (
                <StatusLine text={item.refusal} refused />
              ) : (
                member && <StatusLine {...memberStatus(member)} />
              )}
              {inside.length > 0 && (
                <ul className="mt-1 space-y-1 border-l pl-3">
                  {inside.map((child) => (
                    <li key={`${child.name}-${child.sha256}`}>
                      <div className="text-sm break-all">{child.name}</div>
                      <StatusLine {...memberStatus(child)} />
                    </li>
                  ))}
                </ul>
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
        );
      })}
    </ul>
  );
}
