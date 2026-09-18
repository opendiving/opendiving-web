"use client";

import { useEffect, useRef, useState } from "react";
import type { Area } from "react-easy-crop";
import {
  certificationFile,
  Certification,
  CertificationSide,
  CERTIFICATION_SIDES,
  MAX_CERTIFICATION_FILE_SIZE,
} from "@/lib/api/certifications";
import type { CertificationCardEdits } from "@/lib/certification-card-edits";
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
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  CertificationCardSlot,
  PDF_CONTENT_TYPE,
} from "./certification-card-slot";

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

  const handlePick = async (side: CertificationSide, file: File) => {
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
          const edit = edits[side];
          return (
            <CertificationCardSlot
              key={side}
              side={side}
              certificationUuid={certification?.uuid ?? ""}
              stored={
                certification
                  ? certificationFile(certification, side)
                  : undefined
              }
              pending={edit?.kind === "replace" ? edit.image : null}
              isRemoved={edit?.kind === "remove"}
              disabled={disabled}
              onPick={(file) => void handlePick(side, file)}
              onRemove={() => setEdit(side, { kind: "remove" })}
              onUndo={() => clearEdit(side)}
            />
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
