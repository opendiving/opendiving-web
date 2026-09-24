import { authAPI } from "@/lib/api/auth";
import type { PictureCrop, PictureKind } from "@/lib/picture";

/**
 * The image a pending edit is cropped from: a picked file, or an original fetched from
 * the API. The size is the decoded, upright one the crop is measured in.
 */
export interface PictureSource {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * What saving the form will do to its picture, or nothing at all when the diver has not
 * touched it. Each carries what its one request needs, and the three that show a
 * picture carry what the preview draws it from.
 *
 * `previewUrl` rides on the edit rather than being derived where it is drawn because an
 * object URL has a lifetime somebody has to own: the document holds the bytes until it
 * is revoked. `usePictureEdit` revokes it when the edit is replaced or dropped, and
 * sweeps whatever is left when the form goes.
 */
export type PictureEdit =
  | {
      kind: "replace";
      source: PictureSource;
      /** What the original is stored under: the picked file's own name. */
      filename: string;
      crop: PictureCrop;
      previewUrl: string;
    }
  | {
      /** A new crop over the original the API already holds. */
      kind: "adjust";
      source: PictureSource;
      crop: PictureCrop;
      previewUrl: string;
    }
  | {
      /** The portrait's only: the avatar's original, at a crop of its own. */
      kind: "copy";
      source: PictureSource;
      crop: PictureCrop;
      previewUrl: string;
    }
  | { kind: "remove" };

/** The edits that put a picture on screen, as opposed to taking one off. */
export type PictureEditWithSource = Exclude<PictureEdit, { kind: "remove" }>;

export function pictureEditPreviewUrl(edit: PictureEdit | null): string | null {
  return edit && edit.kind !== "remove" ? edit.previewUrl : null;
}

/**
 * Sends the one request a form's picture edit needs, once the form's fields have saved.
 *
 * **Nothing here runs before the save**, which is the whole reason the form holds an
 * edit rather than uploading on pick: a diver who cancels leaves the stored picture
 * exactly as they found it. Throws what the API answered, for the caller to name the
 * picture in.
 */
export async function applyPictureEdit(
  picture: PictureKind,
  edit: PictureEdit,
): Promise<void> {
  switch (edit.kind) {
    case "replace":
      // `PUT` replaces whatever is there, so it needs no delete in front of it.
      await authAPI.uploadPicture(
        picture,
        edit.source.blob,
        edit.filename,
        edit.crop,
      );
      return;
    case "adjust":
      await authAPI.adjustPicture(picture, edit.crop);
      return;
    case "copy":
      if (picture !== "portrait") {
        throw new Error("Only the portrait is copied from another picture.");
      }
      await authAPI.copyAvatarToPortrait(edit.crop);
      return;
    case "remove":
      await authAPI.removePicture(picture);
      return;
  }
}
