import { describe, expect, it } from "vitest";
import {
  PICTURE_RATIO,
  pictureSizeProblem,
  readPictureType,
  sniffPictureType,
  toPictureCrop,
  type PictureCrop,
  type PictureKind,
} from "./picture";

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("the type is read off the bytes", () => {
  it("knows a JPEG and a PNG by their signatures", () => {
    expect(sniffPictureType(new Uint8Array(JPEG_HEAD))).toBe("image/jpeg");
    expect(sniffPictureType(new Uint8Array(PNG_HEAD))).toBe("image/png");
  });

  it("refuses the formats the API keeps no original of", () => {
    // RIFF....WEBP and GIF89a: both display in a browser, and both are a 415.
    const webp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
    const gif = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
    expect(sniffPictureType(new Uint8Array(webp))).toBeNull();
    expect(sniffPictureType(new Uint8Array(gif))).toBeNull();
    expect(sniffPictureType(new Uint8Array([]))).toBeNull();
  });

  it("reads a file's own bytes rather than its declared type", async () => {
    // What a HEIC renamed `.jpg` looks like to `File.type`.
    const disguised = new File([new Uint8Array([0, 0, 0, 0x18])], "a.jpg", {
      type: "image/jpeg",
    });
    const undeclared = new File([new Uint8Array(PNG_HEAD)], "a", { type: "" });

    expect(await readPictureType(disguised)).toBeNull();
    expect(await readPictureType(undeclared)).toBe("image/png");
  });
});

describe("what the API would refuse by size", () => {
  it("passes a 12 MP phone photo either way round, as a JPEG or a PNG", () => {
    for (const type of ["image/jpeg", "image/png"] as const) {
      expect(pictureSizeProblem(type, 4032, 3024)).toBeNull();
      expect(pictureSizeProblem(type, 3024, 4032)).toBeNull();
    }
  });

  it("holds a PNG to the decode cap, and says what the cap is", () => {
    // An iPhone screenshot passes; a 24 MP PNG does not.
    expect(pictureSizeProblem("image/png", 1179, 2556)).toBeNull();
    const problem = pictureSizeProblem("image/png", 5712, 4284);
    expect(problem).toMatch(/4032 × 3024/);
    expect(problem).toMatch(/5712 × 4284/);
  });

  it("passes a 24 MP JPEG, which the API decodes reduced", () => {
    expect(pictureSizeProblem("image/jpeg", 5712, 4284)).toBeNull();
    expect(pictureSizeProblem("image/jpeg", 8000, 6000)).toBeNull();
  });

  it("holds a JPEG to the 50 MP it may declare", () => {
    expect(pictureSizeProblem("image/jpeg", 10000, 5001)).toMatch(
      /50 megapixels/,
    );
  });

  it("refuses a JPEG too narrow to be reduced and too large to decode whole", () => {
    // A 15000 x 1000 panorama: its short edge is under twice 512, so the API decodes
    // all 15 MP of it and refuses the lot.
    expect(pictureSizeProblem("image/jpeg", 15000, 1000)).toMatch(
      /too large to process/,
    );
    // The same width with a short edge of 1024 halves, to 3.75 MP.
    expect(pictureSizeProblem("image/jpeg", 15000, 1024)).toBeNull();
  });
});

describe("the crop the API is sent", () => {
  const withinRatio = (crop: PictureCrop, kind: PictureKind) => {
    const [width, height] = PICTURE_RATIO[kind];
    return (
      Math.abs(crop.width * height - crop.height * width) <=
      Math.max(width, height)
    );
  };

  it("passes the cropper's own rectangle through untouched", () => {
    const area = { x: 0, y: 72, width: 3024, height: 3888 };
    expect(
      toPictureCrop(area, { width: 3024, height: 4032 }, "portrait"),
    ).toEqual(area);
  });

  it("brings a rectangle one pixel over the edge back inside", () => {
    const crop = toPictureCrop(
      { x: 1, y: 0, width: 700, height: 900 },
      { width: 700, height: 900 },
      "portrait",
    );
    expect(crop.x + crop.width).toBeLessThanOrEqual(700);
    expect(crop.y + crop.height).toBeLessThanOrEqual(900);
    expect(withinRatio(crop, "portrait")).toBe(true);
  });

  it("puts a fractional, off-ratio rectangle on whole pixels at the ratio", () => {
    for (const kind of ["avatar", "portrait"] as const) {
      const crop = toPictureCrop(
        { x: 10.4, y: 20.6, width: 333.3, height: 401.9 },
        { width: 1000, height: 1000 },
        kind,
      );
      for (const value of Object.values(crop)) {
        expect(Number.isInteger(value)).toBe(true);
      }
      expect(withinRatio(crop, kind)).toBe(true);
    }
  });

  it("shrinks a height the width cannot follow", () => {
    // A 7:9 crop 900 high needs 700 wide, and this image has 650.
    const crop = toPictureCrop(
      { x: 0, y: 0, width: 700, height: 900 },
      { width: 650, height: 900 },
      "portrait",
    );
    expect(crop.width).toBeLessThanOrEqual(650);
    expect(crop.height).toBeLessThan(900);
    expect(withinRatio(crop, "portrait")).toBe(true);
  });
});
