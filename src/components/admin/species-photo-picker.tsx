"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  adminAPI,
  type AdminSpecies,
  type AdminSpeciesPhotoCandidate,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/error";
import { speciesDisplayName } from "@/lib/species";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

interface SpeciesPhotoPickerProps {
  /** The species whose photo is being replaced; null keeps the dialog closed. */
  species: AdminSpecies | null;
  onClose: () => void;
  /** Pins `file`. Resolves true when the pin landed, so the dialog can close. */
  onPin: (species: AdminSpecies, file: string) => Promise<boolean>;
}

type Candidates =
  | { state: "loading" }
  | { state: "failed" }
  | {
      state: "loaded";
      category: string | null;
      candidates: AdminSpeciesPhotoCandidate[];
    };

function CandidateTile({
  candidate,
  disabled,
  onPick,
}: {
  candidate: AdminSpeciesPhotoCandidate;
  disabled: boolean;
  onPick: () => void;
}) {
  const size =
    candidate.width && candidate.height
      ? `${candidate.width} × ${candidate.height} px`
      : null;

  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        aria-label={`Use ${candidate.file}`}
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-md border text-left transition-colors hover:border-coral disabled:opacity-60",
          candidate.is_current && "border-coral",
        )}
      >
        {/* Previews arrive as `data:` URIs the API fetched, so nothing here asks
            Wikimedia for anything. A missing one keeps its box. */}
        <div className="aspect-[4/3] w-full bg-muted">
          {candidate.preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={candidate.preview}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <span className="space-y-0.5 p-2 text-xs text-muted-foreground">
          {candidate.is_current && (
            <span className="flex items-center gap-1 font-medium text-foreground">
              <Check className="h-3 w-3" aria-hidden />
              Current
            </span>
          )}
          <span className="block break-words text-foreground">
            {candidate.file}
          </span>
          {size && <span className="block">{size}</span>}
          {candidate.license && (
            <span className="block">{candidate.license}</span>
          )}
          {candidate.author && (
            <span className="block break-words">{candidate.author}</span>
          )}
        </span>
      </button>
    </li>
  );
}

// The dialog's contents for one species. Keyed by the species at the call site, so
// opening it for another starts from a fresh list and an empty field.
function PickerBody({
  species,
  isPinning,
  onPick,
}: {
  species: AdminSpecies;
  isPinning: boolean;
  onPick: (file: string) => void;
}) {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidates>({
    state: "loading",
  });
  const [pasted, setPasted] = useState("");
  const { uuid } = species;

  useEffect(() => {
    let current = true;
    adminAPI
      .speciesPhotoCandidates(uuid)
      .then(({ category, candidates }) => {
        if (current) setCandidates({ state: "loaded", category, candidates });
      })
      .catch((error) => {
        if (!current) return;
        setCandidates({ state: "failed" });
        toast({
          title: "Error",
          description: getApiErrorMessage(
            error,
            "Failed to load the candidates. Please try again.",
          ),
          variant: "destructive",
        });
      });
    return () => {
      current = false;
    };
  }, [uuid, toast]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const file = pasted.trim();
    if (file) onPick(file);
  };

  return (
    <>
      {candidates.state === "loading" && (
        <div className="flex justify-center py-8" aria-busy="true">
          <Loader2
            className="h-6 w-6 animate-spin text-muted-foreground"
            aria-label="Loading candidates"
          />
        </div>
      )}
      {candidates.state === "failed" && (
        <p className="text-sm text-muted-foreground">
          No candidates to show. A pasted file can still be pinned.
        </p>
      )}
      {candidates.state === "loaded" &&
        (candidates.candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Commons offered no files for this species.
          </p>
        ) : (
          <>
            {candidates.category && (
              <p className="text-sm text-muted-foreground">
                From Category:{candidates.category}
              </p>
            )}
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {candidates.candidates.map((candidate) => (
                <CandidateTile
                  key={candidate.file}
                  candidate={candidate}
                  disabled={isPinning}
                  onPick={() => onPick(candidate.file)}
                />
              ))}
            </ul>
          </>
        ))}

      <form onSubmit={submit} className="space-y-2">
        <Label htmlFor="species-photo-file">Commons file title or URL</Label>
        <div className="flex gap-2">
          <Input
            id="species-photo-file"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder="File:… or https://commons.wikimedia.org/wiki/File:…"
            disabled={isPinning}
            className="min-w-0"
          />
          <Button type="submit" disabled={isPinning || !pasted.trim()}>
            {isPinning && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            )}
            Use
          </Button>
        </div>
      </form>
    </>
  );
}

// The Replace dialog: the files the API found for this species, and a field for
// any other Commons file by title or page URL.
export function SpeciesPhotoPicker({
  species,
  onClose,
  onPin,
}: SpeciesPhotoPickerProps) {
  const [isPinning, setIsPinning] = useState(false);

  const pin = async (file: string) => {
    if (!species) return;
    setIsPinning(true);
    try {
      if (await onPin(species, file)) onClose();
    } finally {
      setIsPinning(false);
    }
  };

  return (
    <Dialog
      open={species !== null}
      onOpenChange={(open) => !open && !isPinning && onClose()}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Replace the photo</DialogTitle>
          <DialogDescription>
            {species
              ? `Pick a file for ${speciesDisplayName(species)}, or paste any Wikimedia Commons file. A pinned photo stays until it is hidden or re-fetched.`
              : null}
          </DialogDescription>
        </DialogHeader>

        {species && (
          <PickerBody
            key={species.uuid}
            species={species}
            isPinning={isPinning}
            onPick={pin}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
