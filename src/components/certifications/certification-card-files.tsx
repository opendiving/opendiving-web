"use client";

import { useEffect, useRef, useState } from "react";
import type { Area } from "react-easy-crop";
import { FileText, Trash2, Undo2, Upload } from "lucide-react";
import {
  certificationFile,
  Certification,
  CertificationSide,
  CERTIFICATION_FILE_ACCEPT,
  CERTIFICATION_SIDES,
  CERTIFICATION_SIDE_HEADINGS,
  CERTIFICATION_SIDE_LABELS,
  MAX_CERTIFICATION_FILE_SIZE,
} from "@/lib/api/certifications";
import type {
  CertificationCardEdits,
  PendingCardImage,
} from "@/lib/certification-card-edits";
import {
  CERTIFICATION_CARD_ASPECT,
  CERTIFICATION_CARD_EXPORT_WIDTH,
} from "@/lib/certification";
import { getApiErrorMessage } from "@/lib/api/error";
import {
  cropToBlob,
  croppedFilename,
  decodeImage,
  ImageCropError,
} from "@/lib/image-crop";
import { formatFileSize } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { IconTooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import {
  CertificationCardFrame,
  CertificationCardImage,
} from "./certification-card-image";

const PDF_CONTENT_TYPE = "application/pdf";

interface CertificationCardFilesProps {
  // The certification being edited, or undefined on the create form - where there
  // is nothing stored yet and every slot starts empty.
  certification?: Certification | null;
  edits: CertificationCardEdits;
  onChange: (edits: CertificationCardEdits) => void;
  disabled?: boolean;
}

/**
 * The card-images half of the certification form: what each side holds now, and
 * what saving the form will do to it.
 *
 * **Nothing is uploaded from here.** Picking an image crops it and parks the bytes
 * in `edits`; the Trash marks a stored file and turns into an Undo. The form sends
 * the lot after the details save (`applyCertificationCardEdits`), so Cancel leaves
 * the stored cards exactly as it found them - the same contract as the dive form's
 * file list, and the reason this is a section of the form rather than a dialog of
 * its own reached from a second button.
 *
 * Both slots are always shown, empty or not, but only the first is expected to be
 * filled: modern e-cards are usually one-sided, so the second slot is optional and
 * its heading says so. Keeping it on screen is what lets the diver holding a
 * two-sided card - TDI/SDI still prints one - find somewhere to put the back
 * without hunting for a control that only appears once it is needed.
 */
export function CertificationCardFiles({
  certification,
  edits,
  onChange,
  disabled = false,
}: CertificationCardFilesProps) {
  const { toast } = useToast();
  // The side whose picked image is being cropped, and the object URL it decodes
  // from. Held together because one without the other is not a state this has.
  const [cropping, setCropping] = useState<{
    side: CertificationSide;
    url: string;
  } | null>(null);
  // One ref per side; a single shared input can't tell us which slot was clicked.
  const inputRefs = {
    front: useRef<HTMLInputElement>(null),
    back: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    if (!cropping) return;
    return () => URL.revokeObjectURL(cropping.url);
  }, [cropping]);

  // Every preview URL this section has handed out, so the ones still outstanding
  // can be released when it goes. An object URL is held by the document until it
  // is revoked explicitly, and the edits themselves outlive this component - the
  // form holds them.
  const previewUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  // Releases whatever the edit being replaced was previewing. A slot the diver
  // re-picks twice would otherwise leak the first two images for the life of the
  // page.
  const releasePreview = (side: CertificationSide) => {
    const previous = edits[side];
    const url = previous?.kind === "replace" ? previous.image.previewUrl : null;
    if (!url) return;
    URL.revokeObjectURL(url);
    previewUrls.current.delete(url);
  };

  const setEdit = (
    side: CertificationSide,
    edit: NonNullable<CertificationCardEdits[CertificationSide]>,
  ) => {
    releasePreview(side);
    if (edit.kind === "replace" && edit.image.previewUrl) {
      previewUrls.current.add(edit.image.previewUrl);
    }
    onChange({ ...edits, [side]: edit });
  };

  const clearEdit = (side: CertificationSide) => {
    releasePreview(side);
    const next = { ...edits };
    delete next[side];
    onChange(next);
  };

  const showError = (error: unknown, fallback: string) =>
    toast({
      title: "Error",
      // A failure raised in this browser carries its own message and has no
      // response for `getApiErrorMessage` to read, which would swap it for the
      // fallback.
      description:
        error instanceof ImageCropError
          ? error.message
          : getApiErrorMessage(error, fallback),
      variant: "destructive",
    });

  const handleFileSelected = async (
    side: CertificationSide,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    // Cleared unconditionally, so picking the *same* file again after a cancelled
    // crop still fires a change event.
    event.target.value = "";
    if (!file) return;

    // Checked here as well as by the API so a diver on a slow connection isn't
    // made to upload 40 MB before being told no. The API re-checks regardless,
    // and its check is the one that counts.
    if (file.size > MAX_CERTIFICATION_FILE_SIZE) {
      toast({
        title: "File too large",
        description: "Card images must be 10 MB or smaller.",
        variant: "destructive",
      });
      return;
    }

    // A PDF has no crop step: it is stored whole and never rendered, so there is
    // nothing to frame and no canvas that could read it.
    if (file.type === PDF_CONTENT_TYPE) {
      setEdit(side, {
        kind: "replace",
        image: { blob: file, filename: file.name },
      });
      return;
    }

    const url = URL.createObjectURL(file);

    // Decode before opening the cropper rather than discovering the problem
    // inside it: `react-easy-crop` has no failure callback, so bytes it cannot
    // read leave an empty frame and a Save button that never enables. The live
    // case is a HEIC picked through the iOS Files app, which walks past `accept`.
    try {
      await decodeImage(url);
    } catch (error) {
      URL.revokeObjectURL(url);
      showError(error, "That file could not be read as an image.");
      return;
    }

    setCropping({ side, url });
  };

  const handleCropped = async (area: Area) => {
    if (!cropping) return;
    const { side, url } = cropping;

    try {
      // WebP, not PNG: this API stores what it is given rather than re-encoding
      // it, so the encoding chosen here is the one the diver's card lives in
      // forever. A browser with no WebP encoder falls back to PNG on its own -
      // the spec says so - which is why the name comes off the blob's own type.
      const blob = await cropToBlob(url, area, {
        maxWidth: CERTIFICATION_CARD_EXPORT_WIDTH,
        type: "image/webp",
        quality: 0.9,
      });
      setEdit(side, {
        kind: "replace",
        image: {
          blob,
          filename: croppedFilename(`card-${side}`, blob),
          previewUrl: URL.createObjectURL(blob),
        },
      });
      setCropping(null);
    } catch (error) {
      showError(error, "That image could not be prepared.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {CERTIFICATION_SIDES.map((side) => {
          const stored = certification
            ? certificationFile(certification, side)
            : undefined;
          const edit = edits[side];
          const isRemoved = edit?.kind === "remove";
          const pending = edit?.kind === "replace" ? edit.image : null;

          return (
            <div key={side} className="space-y-2">
              <p className="text-sm font-medium">
                {CERTIFICATION_SIDE_HEADINGS[side]}
              </p>

              {pending ? (
                <PendingCardPreview image={pending} side={side} />
              ) : (
                <CertificationCardImage
                  certificationUuid={certification?.uuid ?? ""}
                  side={side}
                  file={isRemoved ? undefined : stored}
                />
              )}

              <input
                ref={inputRefs[side]}
                type="file"
                accept={CERTIFICATION_FILE_ACCEPT}
                className="hidden"
                aria-label={`Choose a ${CERTIFICATION_SIDE_LABELS[side].toLowerCase()} card image`}
                onChange={(event) => void handleFileSelected(side, event)}
              />

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => inputRefs[side].current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {stored && !isRemoved && !pending ? "Replace" : "Upload"}
                </Button>

                {isRemoved ? (
                  <IconTooltip label={`Keep the ${side} image`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={() => clearEdit(side)}
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  </IconTooltip>
                ) : (
                  (pending || stored) && (
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
                        // A picked image is dropped rather than marked: there is
                        // nothing stored yet for a save to delete, so the edit
                        // simply goes.
                        onClick={() =>
                          pending
                            ? clearEdit(side)
                            : setEdit(side, { kind: "remove" })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </IconTooltip>
                  )
                )}
              </div>

              {/* Every deferred state says so in words. The preview alone cannot:
                  a slot showing a new picture and a slot showing the stored one
                  look the same until the diver is told which is which. */}
              <SlotCaption
                pendingBytes={pending?.blob.size ?? null}
                isRemoved={isRemoved}
                replacesStored={!!stored}
                stored={stored}
              />
            </div>
          );
        })}
      </div>

      {/* Said before the upload rather than after it: RAID hands out a PNG and
          a PDF of the same card, so the choice is the diver's to make here. The
          formats named are every non-PDF entry in `CERTIFICATION_FILE_ACCEPT`.
          Why a PDF cannot be shown is `CertificationCardImage`'s to explain. */}
      <p className="text-xs text-muted-foreground">
        PNG, JPEG and WEBP images are shown here. A PDF is stored and can be
        downloaded, but not displayed — if your agency offers both, pick the
        image.
      </p>

      {cropping && (
        <ImageCropDialog
          imageSrc={cropping.url}
          aspect={CERTIFICATION_CARD_ASPECT}
          title="Frame your card"
          description="Drag to move, pinch or use the slider to zoom. Everything inside the frame is saved, and that is the shape cards are shown in."
          saveLabel="Use this crop"
          savingLabel="Preparing..."
          isSaving={false}
          onCancel={() => setCropping(null)}
          onSave={(area) => void handleCropped(area)}
        />
      )}
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
  pendingBytes,
  isRemoved,
  replacesStored,
  stored,
}: {
  pendingBytes: number | null;
  isRemoved: boolean;
  replacesStored: boolean;
  stored?: { original_filename: string; byte_size: number };
}) {
  if (pendingBytes !== null) {
    return (
      <p className="text-xs text-muted-foreground">
        {replacesStored ? "Replaces the stored image" : "Added"} when you save ·{" "}
        {formatFileSize(pendingBytes)}
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
