"use client";

import { useRef } from "react";
import { FileText, Trash2, Undo2, Upload } from "lucide-react";
import {
  CertificationSide,
  CertificationFileInfo,
  CERTIFICATION_FILE_ACCEPT,
  CERTIFICATION_SIDE_HEADINGS,
  CERTIFICATION_SIDE_LABELS,
} from "@/lib/api/certifications";
import type { PendingCardImage } from "@/lib/certification-card-edits";
import { formatFileSize } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import {
  CertificationCardFrame,
  CertificationCardImage,
} from "./certification-card-image";

/** A PDF is stored whole and never rendered - see `CertificationCardImage`. */
export const PDF_CONTENT_TYPE = "application/pdf";

interface CertificationCardSlotProps {
  side: CertificationSide;
  /** The uuid to fetch a stored image from, or "" on the create form. */
  certificationUuid: string;
  /** What the API holds for this side today. */
  stored?: CertificationFileInfo;
  /** Bytes the diver has picked, which the stored image gives way to. */
  pending: PendingCardImage | null;
  /** True once the stored image is struck off, pending the save. */
  isRemoved: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  /** Takes back a removal, or drops a picked image. */
  onUndo: () => void;
}

/**
 * One side of a card in the certification form: what the slot holds, what saving
 * will do to it, and the two controls that change either.
 *
 * Presentation only - it neither uploads nor crops. `CertificationCardFiles` owns
 * the picked bytes and the edit list, which is what makes "nothing is sent until
 * the form is saved" a property of one place rather than of two.
 */
export function CertificationCardSlot({
  side,
  certificationUuid,
  stored,
  pending,
  isRemoved,
  disabled,
  onPick,
  onRemove,
  onUndo,
}: CertificationCardSlotProps) {
  // Its own input, now that a slot is its own component: the picker has to be
  // opened from a Button, which cannot be a file input.
  const inputRef = useRef<HTMLInputElement>(null);
  const label = CERTIFICATION_SIDE_LABELS[side].toLowerCase();
  const showsSomething = !!pending || (!!stored && !isRemoved);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{CERTIFICATION_SIDE_HEADINGS[side]}</p>

      {pending ? (
        <PendingCardPreview image={pending} side={side} />
      ) : (
        <CertificationCardImage
          certificationUuid={certificationUuid}
          side={side}
          file={isRemoved ? undefined : stored}
        />
      )}

      <input
        type="file"
        accept={CERTIFICATION_FILE_ACCEPT}
        className="hidden"
        aria-label={`Choose a ${label} card image`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared unconditionally, so picking the *same* file again after a
          // cancelled crop still fires a change event.
          event.target.value = "";
          if (file) onPick(file);
        }}
        ref={inputRef}
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4 mr-2" />
          {/* What the button does to what the slot is showing, not to what is
              stored: a picked image is as replaceable as a saved one. */}
          {showsSomething ? "Replace" : "Upload"}
        </Button>

        {isRemoved ? (
          <IconTooltip label={`Keep the ${side} image`}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={onUndo}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          </IconTooltip>
        ) : (
          showsSomething && (
            <IconTooltip
              label={
                pending
                  ? `Discard the new ${side} image`
                  : `Remove the ${side} image`
              }
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                // A picked image is dropped rather than marked: there is nothing
                // stored yet for a save to delete, so the edit simply goes.
                onClick={pending ? onUndo : onRemove}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </IconTooltip>
          )
        )}
      </div>

      {/* Every deferred state says so in words. The preview alone cannot: a slot
          showing a new picture and a slot showing the stored one look the same
          until the diver is told which is which. */}
      <SlotCaption
        pending={pending}
        isRemoved={isRemoved}
        stored={isRemoved ? undefined : stored}
        replacesStored={!!stored}
      />
    </div>
  );
}

/**
 * The picked bytes, drawn in the same frame the stored card will be.
 *
 * A PDF gets the labelled box `CertificationCardImage` gives a stored one, for the
 * reason that component explains: the app's CSP has no way to render one inline.
 * It carries no `previewUrl` for the same reason.
 */
function PendingCardPreview({
  image,
  side,
}: {
  image: PendingCardImage;
  side: CertificationSide;
}) {
  if (image.blob.type === PDF_CONTENT_TYPE) {
    return (
      <CertificationCardFrame className="flex-col gap-1 text-muted-foreground">
        <FileText className="h-6 w-6" />
        <span className="text-xs">PDF</span>
      </CertificationCardFrame>
    );
  }

  return (
    <CertificationCardFrame>
      {image.previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.previewUrl}
          alt={`New ${side} of certification card`}
          // Already cropped to the frame's own shape, so this crops nothing; it
          // matches the stored preview beside it rather than inventing a second
          // fit rule.
          className="h-full w-full object-cover"
        />
      )}
    </CertificationCardFrame>
  );
}

// What this slot will hold once the form is saved, in words.
function SlotCaption({
  pending,
  isRemoved,
  replacesStored,
  stored,
}: {
  pending: PendingCardImage | null;
  isRemoved: boolean;
  replacesStored: boolean;
  stored?: CertificationFileInfo;
}) {
  if (pending) {
    return (
      <p className="text-xs text-muted-foreground">
        {replacesStored ? "Replaces the stored image" : "Added"} when you save ·{" "}
        {formatFileSize(pending.blob.size)}
      </p>
    );
  }

  if (isRemoved) {
    return (
      <p className="text-xs text-muted-foreground">Deleted when you save</p>
    );
  }

  if (stored) {
    return (
      <p className="text-xs text-muted-foreground truncate">
        {stored.original_filename} · {formatFileSize(stored.byte_size)}
      </p>
    );
  }

  return null;
}
