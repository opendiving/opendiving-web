import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvatarCard } from "./avatar-card";

// The card's logic is the pipeline between a picked file and a saved picture: pick →
// crop → PUT → re-read the user, with a toast at each end. A render is the only thing
// that reaches it, and the two states a diver notices when it breaks are a picture
// that saved but never appeared (no `refreshUser`) and a failure that says nothing.

// The whole value is hoisted and returned by identity, `user` included. Nothing this
// card renders depends on that today - the digest reaches `UserAvatar` as a string,
// and the card's one effect is keyed on an object URL - but the real `AuthContext`
// holds `user` in state and so keeps one identity across renders, and a mock that
// rebuilds it per render is what put the new-dive page's test in an unbounded loop
// with its own `form.reset`. Varying a field means writing to `auth.user`, which
// leaves the identity alone. See "The new-dive render test was in a loop with
// itself" in DECISIONS.md.
const auth = vi.hoisted(() => ({
  user: {
    uuid: "user-1",
    name: "Jane Doe",
    avatar_sha256: null as string | null,
  },
  refreshUser: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("@/lib/api/auth", async (importOriginal) => ({
  // The two constants the card reads are the real ones - the size guard below is
  // asserting against the API's actual ceiling, not against a number this file made
  // up.
  ...(await importOriginal<typeof import("@/lib/api/auth")>()),
  authAPI: {
    uploadAvatar: vi.fn(),
    removeAvatar: vi.fn(),
    getAvatarBlob: vi.fn(),
  },
}));

// jsdom has neither canvas nor an image decoder, so the two parts of the flow that
// genuinely cannot run here stand in. `AvatarImageError` is deliberately the real
// class - the card branches on `instanceof` to decide whose message to show, and a
// stubbed one would make that branch untestable.
vi.mock("@/lib/avatar-crop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/avatar-crop")>()),
  cropToPngBlob: vi.fn(),
  decodeImage: vi.fn(),
}));

// The cropper is a gesture surface with no meaningful behaviour under jsdom (it
// measures itself with a ResizeObserver that reports zeroes), so it stands in as the
// one thing the card cares about: a Save that hands back a crop rectangle.
vi.mock("./avatar-crop-dialog", () => ({
  AvatarCropDialog: ({
    isSaving,
    onCancel,
    onSave,
  }: {
    isSaving: boolean;
    onCancel: () => void;
    onSave: (area: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => void;
  }) => (
    <div role="dialog" aria-label="Adjust your photo">
      <button
        type="button"
        disabled={isSaving}
        onClick={() => onSave({ x: 10, y: 20, width: 300, height: 300 })}
      >
        Save photo
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

const { authAPI, MAX_AVATAR_UPLOAD_SIZE } = await import("@/lib/api/auth");
const { AvatarImageError, cropToPngBlob, decodeImage } =
  await import("@/lib/avatar-crop");

// The preview is a real `UserAvatar`, which fetches the current picture's bytes.
const getAvatarBlob = vi.mocked(authAPI.getAvatarBlob);
const uploadAvatar = vi.mocked(authAPI.uploadAvatar);
const removeAvatar = vi.mocked(authAPI.removeAvatar);
const crop = vi.mocked(cropToPngBlob);
const decode = vi.mocked(decodeImage);

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

const croppedBlob = new Blob(["png"], { type: "image/png" });

beforeEach(() => {
  auth.user.avatar_sha256 = null;
  auth.refreshUser.mockReset().mockResolvedValue(undefined);
  getAvatarBlob.mockReset().mockResolvedValue(new Blob(["png"]));
  uploadAvatar.mockReset().mockResolvedValue({ sha256: "newsha" });
  removeAvatar.mockReset().mockResolvedValue(undefined);
  crop.mockReset().mockResolvedValue(croppedBlob);
  decode.mockReset().mockResolvedValue({} as HTMLImageElement);
  toast.mockReset();

  URL.createObjectURL = vi.fn(() => "blob:picked");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

const picker = () => screen.getByLabelText("Choose a profile picture");

function photo(name = "me.jpg", bytes = 1000) {
  return new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });
}

describe("AvatarCard", () => {
  it("offers a photo and no way to remove one that isn't there", () => {
    render(<AvatarCard />);

    expect(
      screen.getByRole("button", { name: /Add a photo/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  });

  it("crops the picked file and uploads it, then re-reads the user", async () => {
    render(<AvatarCard />);

    await userEvent.upload(picker(), photo());
    await userEvent.click(screen.getByRole("button", { name: "Save photo" }));

    await waitFor(() =>
      expect(crop).toHaveBeenCalledWith("blob:picked", {
        x: 10,
        y: 20,
        width: 300,
        height: 300,
      }),
    );
    expect(uploadAvatar).toHaveBeenCalledWith(croppedBlob, "avatar.png");
    // Without this the picture is stored and the header still shows initials: the
    // digest on `user` is what every `UserAvatar` fetches from.
    expect(auth.refreshUser).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Saved" }),
    );
    // The dialog closes on success, and the object URL behind it is released.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picked");
  });

  it("keeps the dialog open and says why when the upload fails", async () => {
    uploadAvatar.mockRejectedValue(new Error("nope"));
    render(<AvatarCard />);

    await userEvent.upload(picker(), photo());
    await userEvent.click(screen.getByRole("button", { name: "Save photo" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
    // Still open, so the crop that was just adjusted is not lost to a retry.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("refuses a file over the API's own ceiling without a round trip", async () => {
    render(<AvatarCard />);

    await userEvent.upload(
      picker(),
      photo("huge.jpg", MAX_AVATAR_UPLOAD_SIZE + 1),
    );

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it("refuses a file the browser cannot decode instead of opening a dead dialog", async () => {
    // `react-easy-crop` has no failure callback, so a source it cannot decode
    // would leave the dialog with a Save button that never enables and nothing
    // said about why. The live case is a HEIC picked through the iOS Files app.
    decode.mockRejectedValue(
      new AvatarImageError("That file could not be read."),
    );
    render(<AvatarCard />);

    await userEvent.upload(picker(), photo("photo.heic"));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "That file could not be read.",
          variant: "destructive",
        }),
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    // The object URL is released rather than held for a dialog that never opens.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picked");
  });

  it("shows a local failure's own message rather than the generic fallback", async () => {
    // `getApiErrorMessage` reads an axios `detail` and returns its fallback for
    // anything else, so a plain `Error` from the canvas would be silently
    // replaced by "Failed to save your picture". `AvatarImageError` is what keeps
    // the precise message.
    crop.mockRejectedValue(
      new AvatarImageError("This browser could not prepare the image."),
    );
    render(<AvatarCard />);

    await userEvent.upload(picker(), photo());
    await userEvent.click(screen.getByRole("button", { name: "Save photo" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "This browser could not prepare the image.",
        }),
      ),
    );
  });

  it("removes an existing picture with no confirmation step", async () => {
    auth.user.avatar_sha256 = "abc123";
    render(<AvatarCard />);

    await userEvent.click(screen.getByRole("button", { name: /Remove/ }));

    await waitFor(() => expect(removeAvatar).toHaveBeenCalled());
    expect(auth.refreshUser).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Removed" }),
    );
  });

  it("says so when the remove fails", async () => {
    auth.user.avatar_sha256 = "abc123";
    removeAvatar.mockRejectedValue(new Error("nope"));
    render(<AvatarCard />);

    await userEvent.click(screen.getByRole("button", { name: /Remove/ }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
  });
});
