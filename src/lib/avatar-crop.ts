import type { Area } from "react-easy-crop";

/**
 * The largest avatar the app ever sends. The API bounds what it stores to the same
 * 512 px, so anything bigger would be uploaded only to be thrown away; the biggest
 * mount is 80 px, so this is already ×2 retina with room over.
 */
export const AVATAR_EXPORT_SIZE = 512;

/**
 * The square canvas to draw a crop of `cropSizePx` natural pixels onto.
 *
 * Capped at `AVATAR_EXPORT_SIZE` and otherwise the crop's own size, so a small
 * source is never blown up on the way out. Upscaling here would cost bytes and
 * invent detail, and the API declines to upscale for the same reason - a picture
 * smaller than 512 px is stored at whatever size it arrived.
 *
 * Rounded down and floored at 1: `croppedAreaPixels` is fractional, and a canvas
 * dimension of 0 throws rather than producing an empty image.
 */
export function avatarExportSize(cropSizePx: number): number {
  if (!Number.isFinite(cropSizePx)) return AVATAR_EXPORT_SIZE;
  return Math.max(1, Math.min(AVATAR_EXPORT_SIZE, Math.floor(cropSizePx)));
}

/**
 * A failure that happened in this browser rather than at the API - bytes that
 * would not decode, a canvas the platform refused to give.
 *
 * It exists so callers can tell the two apart. `getApiErrorMessage` reads only an
 * axios response's `detail` and returns its fallback for everything else, so
 * routing one of these through it would replace a precise message with a generic
 * one. Catch this type and show `message` directly.
 */
export class AvatarImageError extends Error {}

/**
 * Resolves once `src` has decoded, or rejects with an `AvatarImageError`.
 *
 * Exported because the crop dialog needs this answer *before* it opens:
 * `react-easy-crop` has no failure callback of its own, so bytes it cannot decode
 * leave it showing an empty frame forever rather than reporting anything.
 */
export function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new AvatarImageError("That file could not be read as an image."));
    image.src = src;
  });
}

/**
 * Draws `area` of `imageSrc` onto a square canvas and returns it as a PNG Blob.
 *
 * **PNG, not JPEG, and that is not a quality preference.** `toBlob("image/jpeg")`
 * has no alpha channel to put transparency in, and the canvas spec composites it
 * onto **black** - so a logo or an avatar with a transparent corner comes back with
 * a black wedge in it. The server owns final compression anyway (it re-encodes
 * everything to WebP), so the client's job is to hand over the pixels intact and
 * stay out of the quality business.
 *
 * `area` is `react-easy-crop`'s `croppedAreaPixels`: natural pixels of the source
 * image, already square because the cropper runs at `aspect={1}`.
 *
 * Not unit-tested, unlike `avatarExportSize` above: jsdom has no canvas
 * implementation, so `getContext("2d")` returns nothing there and a test would only
 * be exercising a mock of the API it is meant to be checking.
 */
export async function cropToPngBlob(
  imageSrc: string,
  area: Area,
): Promise<Blob> {
  const image = await decodeImage(imageSrc);
  const size = avatarExportSize(Math.min(area.width, area.height));

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new AvatarImageError("This browser could not prepare the image.");
  }

  context.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    size,
    size,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else
        reject(
          new AvatarImageError("This browser could not prepare the image."),
        );
    }, "image/png");
  });
}
