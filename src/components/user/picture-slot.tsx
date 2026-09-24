"use client";

import { useRef } from "react";
import { Crop, Trash2, Undo2, Upload, UserSquare } from "lucide-react";

import { PICTURE_ACCEPT, PICTURE_LABEL, type PictureKind } from "@/lib/picture";
import type { PictureEdit, PictureEditWithSource } from "@/lib/picture-edits";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { IconTooltip } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { PortraitFrame, PortraitImage } from "./portrait-image";

const HEADING: Record<PictureKind, string> = {
  avatar: "Profile picture",
  portrait: "Portrait",
};

const HELP: Record<PictureKind, string> = {
  avatar:
    "Shown in the account menu. The photo you pick is kept without its location data, so its crop can be adjusted later.",
  portrait:
    "Your face, as on a passport photo, for a dive shop's desk: shown on your check-in page and nowhere else. The photo you pick is kept without its location data.",
};

interface PictureSlotProps {
  picture: PictureKind;
  name: string;
  /** The stored rendition's digest, or null when there is none. */
  storedSha: string | null;
  /** Whether "Adjust" has something to open: a pending edit, or a stored original. */
  canAdjust: boolean;
  /** Whether "Use profile picture" has an original to copy. */
  canCopy: boolean;
  edit: PictureEdit | null;
  /** Which original is being fetched, so its button can say so. */
  loading: "adjust" | "copy" | null;
  disabled: boolean;
  onPick: (file: File) => void;
  onAdjust: () => void;
  onCopy: () => void;
  onChange: (edit: PictureEdit | null) => void;
}

/**
 * One picture as its form shows it: what it holds, what saving will do to it, and the
 * controls that change either.
 *
 * Presentation only - it neither fetches nor crops. `PictureField` owns that, the way
 * `CertificationCardFiles` owns what `CertificationCardSlot` draws.
 */
export function PictureSlot({
  picture,
  name,
  storedSha,
  canAdjust,
  canCopy,
  edit,
  loading,
  disabled,
  onPick,
  onAdjust,
  onCopy,
  onChange,
}: PictureSlotProps) {
  // The picker has to be opened from a Button, which cannot be a file input.
  const inputRef = useRef<HTMLInputElement>(null);
  const label = PICTURE_LABEL[picture];
  const pending = edit && edit.kind !== "remove" ? edit : null;
  const isRemoved = edit?.kind === "remove";
  const shown = isRemoved ? null : storedSha;
  const showsSomething = !!pending || !!shown;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{HEADING[picture]}</p>

      <div className="flex items-start gap-4">
        {pending ? (
          <PendingPreview picture={picture} edit={pending} />
        ) : picture === "avatar" ? (
          <UserAvatar
            name={name}
            avatarSha={shown}
            size={80}
            className="h-20 w-20"
          />
        ) : shown ? (
          <PortraitImage
            name={name}
            portraitSha={shown}
            className="w-20 shrink-0"
          />
        ) : (
          <PortraitFrame
            empty
            className="w-20 shrink-0"
            role="img"
            aria-label="No portrait"
          >
            <UserSquare className="h-6 w-6 text-muted-foreground" aria-hidden />
          </PortraitFrame>
        )}

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {/* What the button does to what the slot is showing: a picked photo is
                  as replaceable as a stored one. */}
              {showsSomething ? "Replace" : "Upload"}
            </Button>

            {canAdjust && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={onAdjust}
              >
                {loading === "adjust" ? (
                  <ButtonSpinner className="mr-2" />
                ) : (
                  <Crop className="h-4 w-4 mr-2" />
                )}
                Adjust
              </Button>
            )}

            {canCopy && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={onCopy}
              >
                {loading === "copy" && <ButtonSpinner className="mr-2" />}
                Use profile picture
              </Button>
            )}

            {isRemoved ? (
              <IconTooltip label={`Keep your ${label}`}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onChange(null)}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </IconTooltip>
            ) : (
              showsSomething && (
                <IconTooltip
                  label={
                    pending
                      ? `Discard the new ${label}`
                      : `Remove your ${label}`
                  }
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    // A pending edit is dropped rather than marked: the stored
                    // picture it would have replaced comes back into view.
                    onClick={() =>
                      onChange(pending ? null : { kind: "remove" })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </IconTooltip>
              )
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {caption(picture, edit, !!storedSha)}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={PICTURE_ACCEPT}
        className="hidden"
        aria-label={`Choose a ${label}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared unconditionally, so picking the *same* file again after a
          // cancelled crop still fires a change event.
          event.target.value = "";
          if (file) onPick(file);
        }}
      />
    </div>
  );
}

// What the slot will hold once the form is saved, in words - a preview alone cannot
// tell a new picture from the stored one.
function caption(
  picture: PictureKind,
  edit: PictureEdit | null,
  hasStored: boolean,
): string {
  const label = PICTURE_LABEL[picture];
  switch (edit?.kind) {
    case "replace":
      return hasStored
        ? `Replaces your ${label} when you save.`
        : "Added when you save.";
    case "adjust":
      return "Re-cropped when you save.";
    case "copy":
      return hasStored
        ? "Your profile picture replaces your portrait when you save."
        : "Your profile picture becomes your portrait when you save.";
    case "remove":
      return "Removed when you save.";
    default:
      return HELP[picture];
  }
}

// A pending edit's crop over its source, drawn by positioning the whole image inside
// the frame rather than by cropping it on a canvas: nothing here makes bytes, and the
// preview shows exactly the rectangle the API will be sent.
function PendingPreview({
  picture,
  edit,
}: {
  picture: PictureKind;
  edit: PictureEditWithSource;
}) {
  const { source, crop, previewUrl } = edit;
  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={previewUrl}
      alt={`New ${PICTURE_LABEL[picture]}`}
      className="absolute max-w-none"
      style={{
        width: `${(source.width / crop.width) * 100}%`,
        left: `${(-crop.x / crop.width) * 100}%`,
        top: `${(-crop.y / crop.height) * 100}%`,
      }}
    />
  );

  return picture === "avatar" ? (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
      {image}
    </div>
  ) : (
    <PortraitFrame className="w-20 shrink-0">{image}</PortraitFrame>
  );
}
