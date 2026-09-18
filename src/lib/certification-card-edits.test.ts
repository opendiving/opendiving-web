import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyCertificationCardEdits } from "./certification-card-edits";
import { certificationsAPI } from "./api/certifications";

vi.mock("./api/certifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/certifications")>();
  return {
    ...actual,
    certificationsAPI: {
      uploadCertificationFile: vi.fn(),
      deleteCertificationFile: vi.fn(),
    },
  };
});

const upload = vi.mocked(certificationsAPI.uploadCertificationFile);
const remove = vi.mocked(certificationsAPI.deleteCertificationFile);

const image = (name: string) => ({
  blob: new Blob(["x"], { type: "image/webp" }),
  filename: name,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyCertificationCardEdits", () => {
  it("touches nothing for a side the diver never opened", async () => {
    // The whole contract of holding edits rather than uploading on pick: a form
    // saved without going near the images leaves the stored ones alone.
    const failures = await applyCertificationCardEdits("cert-1", {});

    expect(failures).toEqual([]);
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("uploads a picked image and deletes a struck-off one", async () => {
    await applyCertificationCardEdits("cert-1", {
      front: { kind: "replace", image: image("card-front.webp") },
      back: { kind: "remove" },
    });

    expect(upload).toHaveBeenCalledWith(
      "cert-1",
      "front",
      expect.any(Blob),
      "card-front.webp",
    );
    expect(remove).toHaveBeenCalledWith("cert-1", "back");
  });

  it("replaces a filled slot with a bare upload, and no delete in front of it", async () => {
    // `PUT .../file/{side}` overwrites, so a delete-then-upload pair would only
    // widen the window in which the card has no image at all.
    await applyCertificationCardEdits("cert-1", {
      front: { kind: "replace", image: image("card-front.webp") },
    });

    expect(remove).not.toHaveBeenCalled();
  });

  it("reports a failed side and still does the other one", async () => {
    // The details are already saved by the time this runs, so stopping here would
    // strand a diver in a form they have to fill in again to retry one image.
    const boom = new Error("nope");
    upload.mockRejectedValueOnce(boom);

    const failures = await applyCertificationCardEdits("cert-1", {
      front: { kind: "replace", image: image("card-front.webp") },
      back: { kind: "remove" },
    });

    expect(failures).toEqual([{ side: "front", error: boom }]);
    expect(remove).toHaveBeenCalledWith("cert-1", "back");
  });

  it("writes one side at a time", async () => {
    // Two writes to one certification are two writes to one row, and a failure has
    // to name the side it belongs to. Asserted by holding the first write open:
    // `order` alone would read the same whether these ran in sequence or happened
    // to resolve in that sequence.
    let releaseUpload: () => void = () => {};
    upload.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseUpload = () =>
            resolve({
              uuid: "file-1",
              side: "front",
              content_type: "image/webp",
              byte_size: 1,
              original_filename: "card-front.webp",
            });
        }),
    );

    const applied = applyCertificationCardEdits("cert-1", {
      front: { kind: "replace", image: image("card-front.webp") },
      back: { kind: "remove" },
    });

    await Promise.resolve();
    expect(remove).not.toHaveBeenCalled();

    releaseUpload();
    await applied;
    expect(remove).toHaveBeenCalledWith("cert-1", "back");
  });
});
