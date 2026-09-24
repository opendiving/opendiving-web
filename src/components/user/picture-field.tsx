"use client";

import { useEffect, useState } from "react";
import type { Area } from "react-easy-crop";

import { useAuth } from "@/contexts/AuthContext";
import { authAPI, type User } from "@/lib/api/auth";
import { getApiErrorMessage } from "@/lib/api/error";
import { decodeImage, ImageCropError } from "@/lib/image-crop";
import {
  MAX_PICTURE_UPLOAD_SIZE,
  PICTURE_LABEL,
  pictureAspect,
  pictureSizeProblem,
  readPictureType,
  toPictureCrop,
  type PictureCrop,
  type PictureKind,
} from "@/lib/picture";
import type {
  PictureEdit,
  PictureEditWithSource,
  PictureSource,
} from "@/lib/picture-edits";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { useToast } from "@/components/ui/use-toast";
import { PictureSlot } from "./picture-slot";

const CROP_DESCRIPTION: Record<PictureKind, string> = {
  avatar:
    "Drag to move, pinch or use the slider to zoom. Only the circle is shown.",
  portrait:
    "Drag to move, pinch or use the slider to zoom. Frame your head and shoulders, as for a passport photo.",
};

// The image a crop is being chosen on, and what the crop is for. `url` is the dialog's
// own object URL, released whenever this changes - never the one a pending edit's
// preview holds, which `usePictureEdit` owns.
interface Cropping {
  purpose: PictureEditWithSource["kind"];
  source: PictureSource;
  url: string;
  filename?: string;
  initial?: PictureCrop;
}

function storedPicture(user: User, kind: PictureKind) {
  return kind === "avatar"
    ? {
        sha: user.avatar_sha256 ?? null,
        originalSha: user.avatar_original_sha256 ?? null,
        crop: user.avatar_crop ?? null,
      }
    : {
        sha: user.portrait_sha256 ?? null,
        originalSha: user.portrait_original_sha256 ?? null,
        crop: user.portrait_crop ?? null,
      };
}

interface PictureFieldProps {
  picture: PictureKind;
  edit: PictureEdit | null;
  onChange: (edit: PictureEdit | null) => void;
  disabled?: boolean;
}

/**
 * One of the diver's two pictures, as a field of the form it is saved with: the
 * picked file, the original fetched to adjust or copy, and the crop chosen on either.
 * `PictureSlot` draws it.
 *
 * **Nothing is sent from here.** Picking, adjusting, removing and copying each end in
 * an edit the form holds and sends after its fields (`applyPictureEdit`), so Cancel
 * leaves the stored picture as it was - the certification form's card images work the
 * same way.
 *
 * The file is refused here, before the crop dialog opens, for anything the API would
 * refuse: a type other than JPEG or PNG, and a size over its caps. Found after Save,
 * the fields beside it would already be saved.
 */
export function PictureField({
  picture,
  edit,
  onChange,
  disabled = false,
}: PictureFieldProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [cropping, setCropping] = useState<Cropping | null>(null);
  // Which original is being fetched, so its button can say so.
  const [loading, setLoading] = useState<"adjust" | "copy" | null>(null);

  useEffect(() => {
    if (!cropping) return;
    return () => URL.revokeObjectURL(cropping.url);
  }, [cropping]);

  if (!user) return null;

  const stored = storedPicture(user, picture);
  const pending = edit && edit.kind !== "remove" ? edit : null;
  const isRemoved = edit?.kind === "remove";

  const refuse = (title: string, description: string) =>
    toast({ title, description, variant: "destructive" });

  const showError = (error: unknown, fallback: string) =>
    refuse(
      "Error",
      // A failure raised in this browser carries its own message and has no response
      // for `getApiErrorMessage` to read, which would swap it for the fallback.
      error instanceof ImageCropError
        ? error.message
        : getApiErrorMessage(error, fallback),
    );

  const handlePick = async (file: File) => {
    if (file.size > MAX_PICTURE_UPLOAD_SIZE) {
      refuse(
        "That photo is too large",
        `Pick one under ${MAX_PICTURE_UPLOAD_SIZE / (1024 * 1024)} MB.`,
      );
      return;
    }

    // From the bytes: a pick through the iOS Files app walks past `accept`, and a
    // HEIC the browser can display is still one the API refuses.
    const type = await readPictureType(file);
    if (!type) {
      refuse("Pick a JPEG or a PNG", "Those are the two a picture is kept as.");
      return;
    }

    const url = URL.createObjectURL(file);
    // Decoded before the dialog opens: `react-easy-crop` has no failure callback, so
    // bytes it cannot read would leave an empty frame and a Save that never enables.
    let image: HTMLImageElement;
    try {
      image = await decodeImage(url);
    } catch (error) {
      URL.revokeObjectURL(url);
      showError(error, "That file could not be read as an image.");
      return;
    }

    const problem = pictureSizeProblem(
      type,
      image.naturalWidth,
      image.naturalHeight,
    );
    if (problem) {
      URL.revokeObjectURL(url);
      refuse("That photo is too large", problem);
      return;
    }

    setCropping({
      purpose: "replace",
      source: {
        blob: file,
        width: image.naturalWidth,
        height: image.naturalHeight,
      },
      url,
      filename: file.name,
    });
  };

  // The dialog on an original the API holds: this picture's own, at its stored crop,
  // or - for "Use profile picture" - the avatar's, at the portrait's default.
  const openOriginal = async (purpose: "adjust" | "copy") => {
    const from: PictureKind = purpose === "copy" ? "avatar" : picture;
    const { originalSha, crop } = storedPicture(user, from);
    setLoading(purpose);
    let url: string | null = null;
    try {
      const blob = await authAPI.getPictureOriginalBlob(
        from,
        originalSha ?? undefined,
      );
      url = URL.createObjectURL(blob);
      const image = await decodeImage(url);
      setCropping({
        purpose,
        source: {
          blob,
          width: image.naturalWidth,
          height: image.naturalHeight,
        },
        url,
        initial: purpose === "adjust" ? (crop ?? undefined) : undefined,
      });
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      showError(error, `Your ${PICTURE_LABEL[from]} could not be loaded.`);
    } finally {
      setLoading(null);
    }
  };

  // A pending edit already has its image, so adjusting it again fetches nothing.
  const handleAdjust = () => {
    if (!pending) {
      void openOriginal("adjust");
      return;
    }
    setCropping({
      purpose: pending.kind,
      source: pending.source,
      url: URL.createObjectURL(pending.source.blob),
      filename: pending.kind === "replace" ? pending.filename : undefined,
      initial: pending.crop,
    });
  };

  const handleCropped = (area: Area) => {
    if (!cropping) return;
    const { purpose, source, filename } = cropping;
    const crop = toPictureCrop(area, source, picture);
    const previewUrl = URL.createObjectURL(source.blob);
    onChange(
      purpose === "replace"
        ? {
            kind: "replace",
            source,
            filename: filename ?? picture,
            crop,
            previewUrl,
          }
        : { kind: purpose, source, crop, previewUrl },
    );
    setCropping(null);
  };

  return (
    <>
      <PictureSlot
        picture={picture}
        name={user.name}
        storedSha={stored.sha}
        canAdjust={!!pending || (!isRemoved && !!stored.originalSha)}
        canCopy={picture === "portrait" && !!user.avatar_original_sha256}
        edit={edit}
        loading={loading}
        disabled={disabled || loading !== null}
        onPick={(file) => {
          handlePick(file).catch((error: unknown) =>
            showError(error, "That file could not be read."),
          );
        }}
        onAdjust={handleAdjust}
        onCopy={() => void openOriginal("copy")}
        onChange={onChange}
      />

      {cropping && (
        <ImageCropDialog
          imageSrc={cropping.url}
          aspect={pictureAspect(picture)}
          initialArea={cropping.initial}
          cropShape={picture === "avatar" ? "round" : "rect"}
          title="Adjust your photo"
          description={CROP_DESCRIPTION[picture]}
          saveLabel="Use this crop"
          savingLabel="Saving..."
          isSaving={false}
          onCancel={() => setCropping(null)}
          onSave={handleCropped}
        />
      )}
    </>
  );
}
