import { describe, expect, it } from "vitest";

import { shrinkPicture } from "./shrink-picture";

// A real browser, because the whole job is decoding and drawing - jsdom has neither.

async function picture(
  width: number,
  height: number,
  type: string,
  draw: (context: OffscreenCanvasRenderingContext2D) => void,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  draw(canvas.getContext("2d")!);
  return canvas.convertToBlob({ type });
}

async function pixelAt(blob: Blob, x: number, y: number) {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0);
  return {
    width: bitmap.width,
    height: bitmap.height,
    rgba: [...context.getImageData(x, y, 1, 1).data],
  };
}

describe("shrinkPicture", () => {
  it("redraws a large PNG as a JPEG within the edge, keeping its shape", async () => {
    const png = await picture(1000, 630, "image/png", (context) => {
      context.fillStyle = "#06c";
      context.fillRect(0, 0, 1000, 630);
    });

    const shrunk = await shrinkPicture(png, 384);

    expect(shrunk.type).toBe("image/jpeg");
    const { width, height } = await pixelAt(shrunk, 0, 0);
    expect([width, height]).toEqual([384, 242]);
  });

  it("flattens transparency onto white", async () => {
    const png = await picture(200, 100, "image/png", (context) => {
      context.fillStyle = "#06c";
      context.fillRect(100, 0, 100, 100);
    });

    const shrunk = await shrinkPicture(png, 384);

    expect(shrunk.type).toBe("image/jpeg");
    const { width, rgba } = await pixelAt(shrunk, 10, 50);
    // Never enlarged: already inside the edge, it is re-encoded at its own size.
    expect(width).toBe(200);
    for (const channel of rgba.slice(0, 3)) {
      expect(channel).toBeGreaterThan(245);
    }
  });

  it("leaves a JPEG that already fits as it is", async () => {
    const jpeg = await picture(300, 200, "image/jpeg", (context) => {
      context.fillStyle = "#06c";
      context.fillRect(0, 0, 300, 200);
    });

    expect(await shrinkPicture(jpeg, 384)).toBe(jpeg);
  });

  it("hands back what it cannot decode", async () => {
    const notAPicture = new Blob(["%PDF-1.7"], { type: "application/pdf" });

    expect(await shrinkPicture(notAPicture, 384)).toBe(notAPicture);
  });
});
