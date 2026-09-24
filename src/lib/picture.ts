import type { Area } from "react-easy-crop";

/**
 * The account's two pictures. The avatar is whatever the diver shows the app; the
 * portrait is an identification photo, shown on the check-in page and nowhere else.
 */
export type PictureKind = "avatar" | "portrait";

/**
 * A rectangle in the **upright** original's pixels - after its EXIF orientation is
 * applied, which is the space a browser decodes a picked file into and so the space
 * `react-easy-crop` reports in. The API's `PictureCrop`.
 */
export interface PictureCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Width to height. 7:9 is 35 x 45 mm, the passport photo's proportion. */
export const PICTURE_RATIO: Record<PictureKind, readonly [number, number]> = {
  avatar: [1, 1],
  portrait: [7, 9],
};

export function pictureAspect(kind: PictureKind): number {
  const [width, height] = PICTURE_RATIO[kind];
  return width / height;
}

/** How each picture is named in a sentence. */
export const PICTURE_LABEL: Record<PictureKind, string> = {
  avatar: "profile picture",
  portrait: "portrait",
};

/**
 * What the file picker offers for either picture: the two formats the API keeps as an
 * original.
 *
 * **Spelled out rather than `image/*`, and that is load-bearing.** Since WebKit's
 * 2024 change, iOS Safari transcodes a HEIC pick to JPEG only when the `accept` list
 * restricts image types and excludes HEIC; `image/*` hands over raw HEIC, which the
 * API refuses. Never add `image/heic` here either - Safari then delivers the original
 * HEIC and has a documented bug converting picked PNGs *to* HEIC. A pick made through
 * the Files app bypasses `accept` entirely, so this is convenience, not validation:
 * `readPictureType` checks the bytes, and the API checks them again.
 */
export const PICTURE_ACCEPT = "image/jpeg,image/png";

/** The API's upload ceiling, mirrored so an oversize file fails before the round trip. */
export const MAX_PICTURE_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

// The API's two pixel caps, mirrored so a picture it would refuse is refused at the
// pick rather than after Save, when the form's fields have already saved. The first
// judges what the file declares; the second what the API actually decodes, which for
// a PNG is every pixel and for a JPEG is Pillow's reduced `draft` towards 512 px.
export const MAX_PICTURE_PIXELS = 50_000_000;
export const MAX_ORIGINAL_DECODE_PIXELS = 4032 * 3024;
const JPEG_DRAFT_TARGET = 512;

export type PictureType = "image/jpeg" | "image/png";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The type the first bytes of a file say it is, when it is one a picture may be. */
export function sniffPictureType(head: Uint8Array): PictureType | null {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg";
  }
  if (PNG_SIGNATURE.every((byte, at) => head[at] === byte)) {
    return "image/png";
  }
  return null;
}

/**
 * Reads the type off the file's own bytes, as the API does, rather than trusting
 * `File.type` - which is the extension's guess, and empty for a pick from the iOS
 * Files app.
 */
export async function readPictureType(file: Blob): Promise<PictureType | null> {
  return sniffPictureType(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
}

// What Pillow's `JpegImageFile.draft` rasterizes: the largest of 1/8, 1/4 and 1/2
// that leaves both edges at least the target, rounded up. Orientation cannot change
// it - the minimum and the product are both symmetric in the two edges.
function jpegDecodedPixels(width: number, height: number): number {
  const reduction = Math.min(
    Math.floor(width / JPEG_DRAFT_TARGET),
    Math.floor(height / JPEG_DRAFT_TARGET),
  );
  const scale = [8, 4, 2, 1].find((step) => reduction >= step) ?? 1;
  return Math.ceil(width / scale) * Math.ceil(height / scale);
}

/**
 * Why the API would refuse a picture of this type and size, or null when it would
 * not. `width` and `height` are the decoded image's, in either orientation.
 */
export function pictureSizeProblem(
  type: PictureType,
  width: number,
  height: number,
): string | null {
  const size = `${width} × ${height}`;
  // A PNG is decoded whole, so the lower cap is the one that binds it.
  if (type === "image/png") {
    return width * height > MAX_ORIGINAL_DECODE_PIXELS
      ? `A PNG can be at most 4032 × 3024 pixels, and this one is ${size}. A JPEG of it will do.`
      : null;
  }
  if (width * height > MAX_PICTURE_PIXELS) {
    return `A JPEG can be at most 50 megapixels, and this one is ${size}.`;
  }
  // Only a very wide JPEG reaches this: its short edge keeps the reduction from
  // happening, so the API decodes it whole.
  return jpegDecodedPixels(width, height) > MAX_ORIGINAL_DECODE_PIXELS
    ? `A ${size} photo this wide is too large to process. Crop it a little first.`
    : null;
}

/**
 * The cropper's rectangle as the API takes it: whole pixels, inside the image, and at
 * the picture's ratio to within the pixel the API allows.
 *
 * `react-easy-crop` already rounds and clamps, so this is normally the identity; it
 * exists so that a rectangle one pixel over an edge or off the ratio - which the API
 * answers with a 422, after the form's fields have saved - cannot be sent at all.
 * The height leads, then the width follows it at the ratio, and the pair shrinks by a
 * pixel until it fits.
 */
export function toPictureCrop(
  area: Area,
  image: { width: number; height: number },
  kind: PictureKind,
): PictureCrop {
  const [ratioWidth, ratioHeight] = PICTURE_RATIO[kind];
  let height = Math.max(1, Math.min(image.height, Math.round(area.height)));
  let width = Math.max(1, Math.round((height * ratioWidth) / ratioHeight));
  while (width > image.width && height > 1) {
    height -= 1;
    width = Math.max(1, Math.round((height * ratioWidth) / ratioHeight));
  }

  // Centred on the rectangle it was given, so a pixel taken off comes off both sides.
  const x = Math.round(area.x + (area.width - width) / 2);
  const y = Math.round(area.y + (area.height - height) / 2);
  return {
    x: Math.min(Math.max(0, x), image.width - width),
    y: Math.min(Math.max(0, y), image.height - height),
    width,
    height,
  };
}
