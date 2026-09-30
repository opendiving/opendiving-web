"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import {
  takeDrop,
  walkDrop,
  type PickedFile,
  type WalkedDrop,
} from "@/lib/dropped-files";
import { cn } from "@/lib/utils";

interface ImportDropZoneProps {
  disabled: boolean;
  onFiles: (files: WalkedDrop) => void;
}

// One target for every file the app reads: dropped on, or pressed to open the
// file dialog. The input takes several files and filters none - the API decides
// what the bytes are, and a file it cannot read comes back as a row saying so.
export function ImportDropZone({ disabled, onFiles }: ImportDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsOver(false);
    if (disabled) return;
    // Taken before anything awaits: the drop's items are gone once it returns.
    const taken = takeDrop(event.dataTransfer);
    void walkDrop(taken).then(onFiles);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Reset so picking the same files again still fires `change`.
    event.target.value = "";
    onFiles({
      picked: files.map((file): PickedFile => ({ file, path: file.name })),
      unreadable: [],
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/60",
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">
          Drop files or a folder here, or choose files
        </span>
      </button>
      <p className="text-sm text-muted-foreground">
        Dive-computer exports, several at once and in any mix; a zip of them; a
        logbook in DiveJSON, UDDF or Subsurface form; an OpenDiving export
        archive.
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        tabIndex={-1}
        onChange={handleChange}
      />
    </>
  );
}
