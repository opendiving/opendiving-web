const JPEG_QUALITY = 0.85;

/**
 * Redraws a picture as a JPEG of no more than `maxEdge` pixels on its long edge.
 *
 * A printed page embeds every picture at its full pixel size, and only a JPEG goes in
 * as it is: Chrome re-encodes anything else losslessly, so a 1000-pixel PNG drawn an
 * inch wide costs over a megabyte of PDF. Transparency is flattened onto white, the
 * paper it prints on. Whatever cannot be decoded or drawn here comes back unchanged -
 * a heavy picture beats a missing one.
 */
export async function shrinkPicture(
  blob: Blob,
  maxEdge: number,
): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return blob;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return blob;
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && blob.type === "image/jpeg") return blob;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return blob;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const shrunk = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    return shrunk ?? blob;
  } finally {
    bitmap.close();
  }
}
