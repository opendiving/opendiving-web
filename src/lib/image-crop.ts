import type { Area } from "react-easy-crop";

/**
 * A failure that happened in this browser rather than at the API - bytes that
 * would not decode, a canvas the platform refused to give.
 *
 * It exists so callers can tell the two apart. `getApiErrorMessage` reads only an
 * axios response's `detail` and returns its fallback for everything else, so
 * routing one of these through it would replace a precise message with a generic
 * one. Catch this type and show `message` directly.
 */
export class ImageCropError extends Error {}

/**
 * Resolves once `src` has decoded, or rejects with an `ImageCropError`.
 *
 * Exported because a crop dialog needs this answer *before* it opens:
 * `react-easy-crop` has no failure callback of its own, so bytes it cannot decode
 * leave it showing an empty frame forever rather than reporting anything.
 */
export function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new ImageCropError("That file could not be read as an image."));
    image.src = src;
  });
}

/**
 * How wide a canvas to draw a crop of `cropWidthPx` natural pixels onto.
 *
 * Capped at `maxWidth` and otherwise the crop's own width, so a small source is
 * never blown up on the way out. Upscaling here would cost bytes and invent
 * detail that is not in the picture.
 *
 * Rounded down and floored at 1: `croppedAreaPixels` is fractional, and a canvas
 * dimension of 0 throws rather than producing an empty image.
 */
export function cropExportWidth(cropWidthPx: number, maxWidth: number): number {
  if (!Number.isFinite(cropWidthPx)) return maxWidth;
  return Math.max(1, Math.min(maxWidth, Math.floor(cropWidthPx)));
}

interface CropToBlobOptions {
  /** The widest canvas to draw onto; a narrower crop is exported at its own size. */
  maxWidth: number;
  /**
   * The encoding to ask the canvas for.
   *
   * **Never `image/jpeg`.** `toBlob("image/jpeg")` has no alpha channel to put
   * transparency in and the canvas spec composites it onto **black**, so a card
   * with a transparent corner comes back with a black wedge in it.
   *
   * A type the browser cannot encode is not an error: the canvas spec says to
   * fall back to `image/png`. That is why callers name the stored file from
   * `Blob.type` rather than from what they asked for - Safari before 16.4 has no
   * WebP encoder and silently hands back a PNG.
   */
  type: "image/png" | "image/webp";
  /** Encoder quality for a lossy `type`; ignored for PNG. */
  quality?: number;
}

/**
 * Draws `area` of `imageSrc` onto a canvas of the same shape and returns it as a
 * Blob.
 *
 * `area` is `react-easy-crop`'s `croppedAreaPixels`: natural pixels of the source
 * image, already in the cropper's `aspect` because that is what it crops to. The
 * canvas keeps that shape, so the exported bytes *are* the aspect ratio the app
 * draws them in and no consumer has to letterbox them.
 *
 * Not unit-tested, unlike `cropExportWidth` above: jsdom has no canvas
 * implementation, so `getContext("2d")` returns nothing there and a test would
 * only be exercising a mock of the API it is meant to be checking.
 */
export async function cropToBlob(
  imageSrc: string,
  area: Area,
  { maxWidth, type, quality }: CropToBlobOptions,
): Promise<Blob> {
  const image = await decodeImage(imageSrc);
  const width = cropExportWidth(area.width, maxWidth);
  // From the crop's own shape rather than from a passed-in aspect, so a rounding
  // difference between the two cannot letterbox the export by a pixel.
  const height = Math.max(
    1,
    Math.round((width * area.height) / Math.max(area.width, 1)),
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new ImageCropError("This browser could not prepare the image.");
  }

  context.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    width,
    height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else
          reject(
            new ImageCropError("This browser could not prepare the image."),
          );
      },
      type,
      quality,
    );
  });
}

/**
 * The filename to store a cropped export under, named from what the canvas
 * actually produced rather than from what was asked for - see
 * `CropToBlobOptions.type`.
 */
export function croppedFilename(stem: string, blob: Blob): string {
  const extension = blob.type === "image/webp" ? "webp" : "png";
  return `${stem}.${extension}`;
}
