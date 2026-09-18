import {
  certificationsAPI,
  CERTIFICATION_SIDES,
  type CertificationSide,
} from "@/lib/api/certifications";

/** Bytes the diver has picked (and cropped, unless they are a PDF), not yet sent. */
export interface PendingCardImage {
  blob: Blob;
  /** What the file is stored under; named from the blob's own type. */
  filename: string;
  /**
   * An object URL for the preview, or absent for a PDF - which is stored whole and
   * never rendered.
   *
   * It rides on the edit rather than being derived where it is drawn because an
   * object URL has a lifetime somebody has to own: the document holds the bytes
   * until it is revoked. Whoever replaces or drops this edit revokes it, and
   * `CertificationCardFiles` sweeps whatever is left when it unmounts.
   */
  previewUrl?: string;
}

/**
 * What the form will do to one side's stored file when it is saved, or nothing at
 * all when the diver has not touched that slot.
 */
export type CertificationCardEdit =
  { kind: "replace"; image: PendingCardImage } | { kind: "remove" };

export type CertificationCardEdits = Partial<
  Record<CertificationSide, CertificationCardEdit>
>;

export interface CertificationCardEditFailure {
  side: CertificationSide;
  error: unknown;
}

/**
 * Sends the card-image changes a certification form collected, once the details
 * themselves have saved.
 *
 * **Nothing here runs before the save**, which is the whole reason the form holds
 * edits rather than uploading on pick: a diver who cancels must leave the stored
 * cards exactly as they found them, and on the create form there is no
 * certification to upload against until it exists. Same shape as the dive form's
 * pending files, for the same reason.
 *
 * Serial and in `CERTIFICATION_SIDES` order so a failure names a side, and so two
 * writes to one certification never race. A failure does not stop the next side:
 * the details are already saved, and a card that did land is worth keeping.
 * Callers get every failure back and say so once per side.
 */
export async function applyCertificationCardEdits(
  certificationUuid: string,
  edits: CertificationCardEdits,
): Promise<CertificationCardEditFailure[]> {
  const failures: CertificationCardEditFailure[] = [];

  for (const side of CERTIFICATION_SIDES) {
    const edit = edits[side];
    if (!edit) continue;

    try {
      if (edit.kind === "remove") {
        await certificationsAPI.deleteCertificationFile(
          certificationUuid,
          side,
        );
      } else {
        // `PUT` replaces whatever is on that side, so an upload needs no delete
        // in front of it even when the slot is already filled.
        await certificationsAPI.uploadCertificationFile(
          certificationUuid,
          side,
          edit.image.blob,
          edit.image.filename,
        );
      }
    } catch (error) {
      failures.push({ side, error });
    }
  }

  return failures;
}
