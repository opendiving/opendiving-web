import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/auth", () => ({
  authAPI: {
    uploadPicture: vi.fn(),
    adjustPicture: vi.fn(),
    copyAvatarToPortrait: vi.fn(),
    removePicture: vi.fn(),
  },
}));

const { authAPI } = await import("@/lib/api/auth");
const { applyPictureEdit, pictureEditPreviewUrl } =
  await import("./picture-edits");

const crop = { x: 0, y: 0, width: 700, height: 900 };
const file = new File(["jpeg"], "me.jpg", { type: "image/jpeg" });
const source = { blob: file, width: 700, height: 900 };

const calls = () => [
  ...vi.mocked(authAPI.uploadPicture).mock.calls.map((c) => ["upload", ...c]),
  ...vi.mocked(authAPI.adjustPicture).mock.calls.map((c) => ["adjust", ...c]),
  ...vi
    .mocked(authAPI.copyAvatarToPortrait)
    .mock.calls.map((c) => ["copy", ...c]),
  ...vi.mocked(authAPI.removePicture).mock.calls.map((c) => ["remove", ...c]),
];

beforeEach(() => {
  vi.mocked(authAPI.uploadPicture)
    .mockReset()
    .mockResolvedValue({ sha256: "a" });
  vi.mocked(authAPI.adjustPicture)
    .mockReset()
    .mockResolvedValue({ sha256: "a" });
  vi.mocked(authAPI.copyAvatarToPortrait)
    .mockReset()
    .mockResolvedValue({ sha256: "a" });
  vi.mocked(authAPI.removePicture).mockReset().mockResolvedValue(undefined);
});

describe("applyPictureEdit sends exactly the one request an edit needs", () => {
  it("uploads the picked file itself, under its own name, with its crop", async () => {
    await applyPictureEdit("portrait", {
      kind: "replace",
      source,
      filename: "me.jpg",
      crop,
      previewUrl: "blob:p",
    });
    expect(calls()).toEqual([["upload", "portrait", file, "me.jpg", crop]]);
  });

  it("re-crops without sending the image again", async () => {
    await applyPictureEdit("avatar", {
      kind: "adjust",
      source,
      crop,
      previewUrl: "blob:p",
    });
    expect(calls()).toEqual([["adjust", "avatar", crop]]);
  });

  it("copies the avatar's original on the server rather than uploading it", async () => {
    await applyPictureEdit("portrait", {
      kind: "copy",
      source,
      crop,
      previewUrl: "blob:p",
    });
    expect(calls()).toEqual([["copy", crop]]);
  });

  it("refuses to copy onto the avatar, which has nothing to copy from", async () => {
    await expect(
      applyPictureEdit("avatar", {
        kind: "copy",
        source,
        crop,
        previewUrl: "blob:p",
      }),
    ).rejects.toThrow();
    expect(calls()).toEqual([]);
  });

  it("removes", async () => {
    await applyPictureEdit("avatar", { kind: "remove" });
    expect(calls()).toEqual([["remove", "avatar"]]);
  });

  it("hands the API's refusal back for the form to name the picture in", async () => {
    const refusal = new Error("415");
    vi.mocked(authAPI.uploadPicture).mockRejectedValue(refusal);
    await expect(
      applyPictureEdit("avatar", {
        kind: "replace",
        source,
        filename: "me.jpg",
        crop,
        previewUrl: "blob:p",
      }),
    ).rejects.toBe(refusal);
  });
});

describe("pictureEditPreviewUrl", () => {
  it("is the URL of an edit that shows a picture, and nothing otherwise", () => {
    expect(
      pictureEditPreviewUrl({
        kind: "adjust",
        source,
        crop,
        previewUrl: "blob:p",
      }),
    ).toBe("blob:p");
    expect(pictureEditPreviewUrl({ kind: "remove" })).toBeNull();
    expect(pictureEditPreviewUrl(null)).toBeNull();
  });
});
