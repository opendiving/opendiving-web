import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileCompletionForm } from "./profile-completion-form";

// The fourth door, and the least obvious one. The other three refuse *before* an
// onboarding token is minted; this form is where the account is actually created,
// and the gate is checked again inside the creating transaction - so a revocation
// committed while the diver was filling this in, or the loser of the race for the
// first account on an empty instance, is refused here and nowhere earlier.
//
// The form already routes every API error through `getApiErrorMessage` into
// `StatusMessage`, so this is a pin rather than new behaviour: what it holds is
// that the refusal stays inline and legible on the page the diver is on, instead
// of becoming a navigation or a generic "could not complete your profile".
const { router, completeProfile } = vi.hoisted(() => ({
  router: { push: vi.fn() },
  completeProfile: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    onboarding: { email: "stranger@example.com", name: "Sam" },
    completeProfile,
  }),
}));

vi.mock("@/lib/api/auth", () => ({
  authAPI: { uploadPicture: vi.fn() },
}));

// jsdom has no image decoder, and the cropper measures itself with a ResizeObserver
// that reports zeroes - so the dialog stands in as the one button that matters.
vi.mock("@/lib/image-crop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image-crop")>()),
  decodeImage: vi.fn(async () => ({ naturalWidth: 1000, naturalHeight: 1000 })),
}));
vi.mock("@/components/ui/image-crop-dialog", () => ({
  ImageCropDialog: ({ onSave }: { onSave: (area: object) => void }) => (
    <button
      type="button"
      onClick={() => onSave({ x: 0, y: 0, width: 900, height: 900 })}
    >
      Use this crop
    </button>
  ),
}));

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

const { authAPI } = await import("@/lib/api/auth");

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

// The account exists once `completeProfile` has its answer, and `onCreated` runs in
// the gap before it is read - the mock does what the context does, in that order.
function createsTheAccount(order: string[] = []) {
  completeProfile.mockImplementation(
    async (
      _name: string,
      _username: string,
      onCreated?: () => Promise<void>,
    ) => {
      order.push("created");
      await onCreated?.();
      order.push("signed in");
    },
  );
  return order;
}

async function pickPicture(user: ReturnType<typeof userEvent.setup>) {
  const jpeg = new Uint8Array(1000);
  jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
  await user.upload(
    screen.getByLabelText("Choose a profile picture"),
    new File([jpeg], "me.jpg", { type: "image/jpeg" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Use this crop" }),
  );
}

async function submit(
  before?: (user: ReturnType<typeof userEvent.setup>) => Promise<void>,
) {
  const user = userEvent.setup();
  render(<ProfileCompletionForm />);
  await before?.(user);
  await user.type(screen.getByLabelText(/username/i), "samreef");
  await user.click(screen.getByRole("button", { name: /finish setting up/i }));
  return user;
}

describe("ProfileCompletionForm", () => {
  it("shows the gate's refusal inline and stays on the form", async () => {
    completeProfile.mockRejectedValue({
      response: {
        status: 403,
        data: {
          detail:
            "This address hasn't been invited to this instance yet. You can request an invitation from the home page.",
        },
      },
    });

    await submit();

    expect(
      await screen.findByText(/hasn't been invited to this instance yet/i),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("still creates the account when the gate lets the address through", async () => {
    completeProfile.mockResolvedValue(undefined);

    await submit();

    expect(completeProfile).toHaveBeenCalledWith(
      "Sam",
      "samreef",
      expect.any(Function),
    );
    expect(router.push).toHaveBeenCalledWith("/dashboard");
  });
});

describe("ProfileCompletionForm's profile picture", () => {
  it("uploads a picked picture once the account exists, before it is signed in", async () => {
    const order = createsTheAccount();
    vi.mocked(authAPI.uploadPicture).mockImplementation(async () => {
      order.push("put");
      return { sha256: "new" } as never;
    });

    await submit(pickPicture);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard"));
    expect(order).toEqual(["created", "put", "signed in"]);
    expect(authAPI.uploadPicture).toHaveBeenCalledWith(
      "avatar",
      expect.any(File),
      "me.jpg",
      { x: 0, y: 0, width: 900, height: 900 },
    );
    expect(toast).not.toHaveBeenCalled();
  });

  it("sends none without a pick", async () => {
    createsTheAccount();

    await submit();

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard"));
    expect(authAPI.uploadPicture).not.toHaveBeenCalled();
  });

  it("still moves on to the made account when the picture fails, and says so", async () => {
    createsTheAccount();
    vi.mocked(authAPI.uploadPicture).mockRejectedValue(new Error("nope"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await submit(pickPicture);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard"));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Your account is ready, but your profile picture did not save",
        description: "Add it again in Settings.",
        variant: "destructive",
      }),
    );
  });
});
