import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "@/lib/api/auth";
import type { PictureKind } from "@/lib/picture";
import { UserFieldsForm, UserFieldsSubmitButton } from "./user-fields-form";

// A picture rides on its form's Save, so what a render reaches is the order of the
// requests and what is *not* sent: nothing on a pick, an adjustment, a remove or a
// copy; the fields first on Save, then exactly one picture request; nothing at all
// on a cancelled crop. The picker's refusals are here too, because a picture the API
// refuses after Save is a picture refused after the fields beside it have saved.

// Hoisted and returned by identity, `user` included: the form resets itself from
// `user` in an effect, and a mock rebuilding it per render resets it under every
// click. See "The new-dive render test was in a loop with itself" in DECISIONS.md.
const auth = vi.hoisted(() => ({
  user: {
    uuid: "user-1",
    name: "Jane Doe",
    username: "jane",
    email: "jane@example.com",
    units: "metric",
    dive_form_hidden_fields: [],
  } as User,
  refreshUser: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("@/lib/api/auth", () => ({
  authAPI: {
    updateProfile: vi.fn(),
    uploadPicture: vi.fn(),
    adjustPicture: vi.fn(),
    copyAvatarToPortrait: vi.fn(),
    removePicture: vi.fn(),
    getPictureBlob: vi.fn(),
    getPictureOriginalBlob: vi.fn(),
  },
}));

// jsdom has no image decoder. `ImageCropError` stays the real class: the slot
// branches on `instanceof` to decide whose message to show.
vi.mock("@/lib/image-crop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image-crop")>()),
  decodeImage: vi.fn(),
}));

// The cropper measures itself with a ResizeObserver that reports zeroes here, so it
// stands in as what the slot cares about: the source and start it was opened on, and
// a rectangle at the aspect it was asked for.
vi.mock("@/components/ui/image-crop-dialog", () => ({
  ImageCropDialog: ({
    imageSrc,
    aspect,
    initialArea,
    onCancel,
    onSave,
  }: {
    imageSrc: string;
    aspect: number;
    initialArea?: object;
    onCancel: () => void;
    onSave: (area: object) => void;
  }) => (
    <div
      role="dialog"
      aria-label="Adjust your photo"
      data-src={imageSrc}
      data-aspect={aspect}
      data-initial={initialArea ? JSON.stringify(initialArea) : ""}
    >
      <button
        type="button"
        onClick={() =>
          onSave({ x: 0, y: 0, width: Math.round(900 * aspect), height: 900 })
        }
      >
        Use this crop
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  ),
}));

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const { authAPI } = await import("@/lib/api/auth");
const { decodeImage, ImageCropError } = await import("@/lib/image-crop");
const decode = vi.mocked(decodeImage);

// Every request in the order it was made, so "the fields first" is an assertion
// about order rather than about two mocks each having been called.
let sent: string[] = [];
const record =
  <T,>(name: string, value: T) =>
  async () => {
    sent.push(name);
    return value;
  };

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
let urls = 0;

const AVATAR_CROP = { x: 0, y: 0, width: 900, height: 900 };
const PORTRAIT_CROP = { x: 0, y: 0, width: 700, height: 900 };

beforeEach(() => {
  sent = [];
  urls = 0;
  Object.assign(auth.user, {
    avatar_sha256: null,
    avatar_original_sha256: null,
    avatar_crop: null,
    portrait_sha256: null,
    portrait_original_sha256: null,
    portrait_crop: null,
  });
  auth.refreshUser.mockReset().mockResolvedValue(undefined);
  vi.mocked(authAPI.updateProfile)
    .mockReset()
    .mockImplementation(record("patch /user", undefined));
  vi.mocked(authAPI.uploadPicture)
    .mockReset()
    .mockImplementation(record("put", { sha256: "new" }));
  vi.mocked(authAPI.adjustPicture)
    .mockReset()
    .mockImplementation(record("patch picture", { sha256: "new" }));
  vi.mocked(authAPI.copyAvatarToPortrait)
    .mockReset()
    .mockImplementation(record("copy", { sha256: "new" }));
  vi.mocked(authAPI.removePicture)
    .mockReset()
    .mockImplementation(record("delete", undefined));
  vi.mocked(authAPI.getPictureBlob).mockReset().mockResolvedValue(new Blob());
  vi.mocked(authAPI.getPictureOriginalBlob)
    .mockReset()
    .mockResolvedValue(new Blob(["original"]));
  decode.mockReset().mockResolvedValue({
    naturalWidth: 1000,
    naturalHeight: 1000,
  } as HTMLImageElement);
  toast.mockReset();

  URL.createObjectURL = vi.fn(() => `blob:${++urls}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

function renderForm(picture: PictureKind) {
  return render(
    <UserFieldsForm
      groups={[{ fields: ["name", "username"] }]}
      picture={picture}
    >
      <UserFieldsSubmitButton />
    </UserFieldsForm>,
  );
}

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function photo(
  name = "me.jpg",
  { head = JPEG, size = 1000 }: { head?: number[]; size?: number } = {},
) {
  const bytes = new Uint8Array(size);
  bytes.set(head);
  return new File([bytes], name, { type: "image/jpeg" });
}

const picker = (picture: PictureKind) =>
  screen.getByLabelText(
    picture === "avatar" ? "Choose a profile picture" : "Choose a portrait",
  );
const save = () =>
  userEvent.click(screen.getByRole("button", { name: /save changes/i }));
const useCrop = () =>
  userEvent.click(screen.getByRole("button", { name: "Use this crop" }));

describe("a picture rides on its form's Save", () => {
  it("sends nothing on a pick, then the fields and then the picked file itself", async () => {
    renderForm("avatar");
    const file = photo();

    await userEvent.upload(picker("avatar"), file);
    await useCrop();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Added when you save.")).toBeInTheDocument();
    expect(sent).toEqual([]);

    await save();

    await waitFor(() => expect(sent).toEqual(["patch /user", "put"]));
    // The file as it was picked - not a canvas re-encode of it - and its crop.
    expect(authAPI.uploadPicture).toHaveBeenCalledWith(
      "avatar",
      file,
      "me.jpg",
      AVATAR_CROP,
    );
    // The re-read is what changes the header's avatar.
    expect(auth.refreshUser).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Saved" }),
    );
  });

  it("still saves when the picture is the only thing that changed", async () => {
    // The fields go every time; a Save is never skipped for want of a dirty field.
    auth.user.portrait_sha256 = "p1";
    renderForm("portrait");

    await userEvent.click(
      screen.getByRole("button", { name: "Remove your portrait" }),
    );
    expect(screen.getByText("Removed when you save.")).toBeInTheDocument();
    expect(sent).toEqual([]);

    await save();

    await waitFor(() => expect(sent).toEqual(["patch /user", "delete"]));
    expect(authAPI.removePicture).toHaveBeenCalledWith("portrait");
  });

  it("sends nothing for a cancelled crop, and releases what it opened", async () => {
    renderForm("avatar");

    await userEvent.upload(picker("avatar"), photo());
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await save();

    await waitFor(() => expect(sent).toEqual(["patch /user"]));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  it("takes a remove back with Undo, which sends nothing", async () => {
    auth.user.avatar_sha256 = "a1";
    renderForm("avatar");

    await userEvent.click(
      screen.getByRole("button", { name: "Remove your profile picture" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Keep your profile picture" }),
    );
    await save();

    await waitFor(() => expect(sent).toEqual(["patch /user"]));
  });

  it("clears the pending picture once it is sent", async () => {
    renderForm("avatar");

    await userEvent.upload(picker("avatar"), photo());
    await useCrop();
    await save();
    await waitFor(() => expect(sent).toEqual(["patch /user", "put"]));

    // The form repaints from the account, which knows nothing of the edit - and the
    // preview it drew from is given back.
    expect(screen.queryByText("Added when you save.")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");

    await save();
    await waitFor(() =>
      expect(sent).toEqual(["patch /user", "put", "patch /user"]),
    );
  });

  it("keeps the saved fields when the picture fails, and names the picture", async () => {
    vi.mocked(authAPI.uploadPicture).mockRejectedValue(new Error("nope"));
    renderForm("portrait");

    await userEvent.upload(picker("portrait"), photo());
    await useCrop();
    await save();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Saved, but your portrait did not",
          variant: "destructive",
        }),
      ),
    );
    expect(authAPI.updateProfile).toHaveBeenCalled();
    expect(auth.refreshUser).toHaveBeenCalled();
    // Not the form's own error: the fields did save.
    expect(screen.queryByText(/failed to save/i)).toBeNull();
    expect(toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Saved" }),
    );
  });

  it("sends no picture when the fields fail", async () => {
    vi.mocked(authAPI.updateProfile).mockRejectedValue(new Error("nope"));
    renderForm("avatar");

    await userEvent.upload(picker("avatar"), photo());
    await useCrop();
    await save();

    await waitFor(() =>
      expect(screen.getByText(/failed to save/i)).toBeInTheDocument(),
    );
    expect(authAPI.uploadPicture).not.toHaveBeenCalled();
    // Still pending, for the Save that follows.
    expect(screen.getByText("Added when you save.")).toBeInTheDocument();
  });
});

describe("Adjust", () => {
  it("is absent while no original is held", () => {
    // An avatar seeded from Google, or stored before originals were kept.
    auth.user.avatar_sha256 = "a1";
    renderForm("avatar");

    expect(screen.queryByRole("button", { name: /adjust/i })).toBeNull();
  });

  it("opens the stored original at its stored crop, and sends only the crop", async () => {
    Object.assign(auth.user, {
      avatar_sha256: "a1",
      avatar_original_sha256: "o1",
      avatar_crop: { x: 10, y: 20, width: 300, height: 300 },
    });
    renderForm("avatar");

    await userEvent.click(screen.getByRole("button", { name: /adjust/i }));

    // The original's digest is its `?v=`, so a replaced original is never served
    // from the browser's cache.
    expect(authAPI.getPictureOriginalBlob).toHaveBeenCalledWith("avatar", "o1");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute(
      "data-initial",
      JSON.stringify({ x: 10, y: 20, width: 300, height: 300 }),
    );

    await useCrop();
    expect(screen.getByText("Re-cropped when you save.")).toBeInTheDocument();
    expect(sent).toEqual([]);

    await save();
    await waitFor(() => expect(sent).toEqual(["patch /user", "patch picture"]));
    expect(authAPI.adjustPicture).toHaveBeenCalledWith("avatar", AVATAR_CROP);
    expect(authAPI.uploadPicture).not.toHaveBeenCalled();
  });

  it("reopens a picked photo at the crop just chosen, without fetching anything", async () => {
    renderForm("avatar");

    await userEvent.upload(picker("avatar"), photo());
    await useCrop();
    await userEvent.click(screen.getByRole("button", { name: /adjust/i }));

    expect(await screen.findByRole("dialog")).toHaveAttribute(
      "data-initial",
      JSON.stringify(AVATAR_CROP),
    );
    expect(authAPI.getPictureOriginalBlob).not.toHaveBeenCalled();
  });

  it("says what went wrong when the original will not load", async () => {
    Object.assign(auth.user, {
      avatar_sha256: "a1",
      avatar_original_sha256: "o1",
      avatar_crop: AVATAR_CROP,
    });
    vi.mocked(authAPI.getPictureOriginalBlob).mockRejectedValue(
      new Error("nope"),
    );
    renderForm("avatar");

    await userEvent.click(screen.getByRole("button", { name: /adjust/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Use profile picture", () => {
  it("is absent while the avatar holds no original", () => {
    auth.user.avatar_sha256 = "a1";
    renderForm("portrait");

    expect(
      screen.queryByRole("button", { name: "Use profile picture" }),
    ).toBeNull();
  });

  it("is never offered on the avatar itself", () => {
    Object.assign(auth.user, {
      avatar_sha256: "a1",
      avatar_original_sha256: "o1",
      avatar_crop: AVATAR_CROP,
    });
    renderForm("avatar");

    expect(
      screen.queryByRole("button", { name: "Use profile picture" }),
    ).toBeNull();
  });

  it("opens the avatar's original at 7:9, and copies it on Save", async () => {
    Object.assign(auth.user, {
      avatar_sha256: "a1",
      avatar_original_sha256: "o1",
      avatar_crop: AVATAR_CROP,
    });
    renderForm("portrait");

    await userEvent.click(
      screen.getByRole("button", { name: "Use profile picture" }),
    );

    expect(authAPI.getPictureOriginalBlob).toHaveBeenCalledWith("avatar", "o1");
    const dialog = await screen.findByRole("dialog");
    expect(Number(dialog.getAttribute("data-aspect"))).toBeCloseTo(7 / 9);
    // The avatar's square is no start for a 7:9 frame.
    expect(dialog).toHaveAttribute("data-initial", "");

    await useCrop();
    expect(sent).toEqual([]);

    await save();
    await waitFor(() => expect(sent).toEqual(["patch /user", "copy"]));
    expect(authAPI.copyAvatarToPortrait).toHaveBeenCalledWith(PORTRAIT_CROP);
  });
});

describe("the picker refuses what the API would, before the dialog opens", () => {
  it("refuses a file over the API's own ceiling", async () => {
    renderForm("avatar");

    await userEvent.upload(
      picker("avatar"),
      photo("huge.jpg", { size: 10 * 1024 * 1024 + 1 }),
    );

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("refuses anything that is not a JPEG or a PNG, naming both", async () => {
    renderForm("portrait");

    // A WebP: the browser would display it, and the API keeps no WebP original.
    await userEvent.upload(
      picker("portrait"),
      photo("shot.webp", { head: [0x52, 0x49, 0x46, 0x46] }),
    );

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/JPEG.*PNG/),
          variant: "destructive",
        }),
      ),
    );
    expect(decode).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("refuses a PNG over the decode cap, naming the cap", async () => {
    decode.mockResolvedValue({
      naturalWidth: 5712,
      naturalHeight: 4284,
    } as HTMLImageElement);
    renderForm("portrait");

    await userEvent.upload(picker("portrait"), photo("big.png", { head: PNG }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringMatching(/4032 × 3024/),
        }),
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  it("refuses a file the browser cannot decode instead of opening a dead dialog", async () => {
    // `react-easy-crop` has no failure callback: undecodable bytes would leave a
    // Save that never enables and nothing said about why.
    decode.mockRejectedValue(
      new ImageCropError("That file could not be read."),
    );
    renderForm("avatar");

    await userEvent.upload(picker("avatar"), photo());

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "That file could not be read.",
          variant: "destructive",
        }),
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });
});

describe("preview URLs", () => {
  it("gives one back when it is replaced, and the rest when the form goes", async () => {
    const { unmount } = renderForm("avatar");

    // Each pick: the dialog's URL (released as the dialog closes), then the preview's.
    await userEvent.upload(picker("avatar"), photo());
    await useCrop();
    await userEvent.upload(picker("avatar"), photo("second.jpg"));
    await useCrop();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:4");

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:4");
  });
});
