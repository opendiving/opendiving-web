import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "@/lib/api/auth";
import type {
  CheckinDetails,
  CheckinDetailsUpdate,
} from "@/lib/api/checkin-details";
import type { PictureEdit } from "@/lib/picture-edits";
import { CheckinDetailsForm } from "./checkin-details-form";
import { UserFieldsSubmitButton } from "@/components/user/user-fields-form";

// The portrait rides on About You's Save as the avatar does on Profile Information's
// (see `user-fields-form.render.test.tsx`); what is particular here is the dialog: a
// picture that failed must not close it, or the pick it keeps goes with it.

const auth = vi.hoisted(() => ({
  user: { uuid: "user-1", name: "Jane Doe", email: "jane@example.com" } as User,
  refreshUser: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

const checkin = vi.hoisted(() => ({
  details: {
    email: null,
    phone: null,
    date_of_birth: null,
    emergency_contacts: [],
    insurance_policies: [],
  } as CheckinDetails,
  loadFailed: false,
  reload: vi.fn(),
  save: vi.fn(),
}));
vi.mock("@/contexts/CheckinDetailsContext", () => ({
  useCheckinDetails: () => checkin,
}));

vi.mock("@/lib/api/auth", () => ({
  authAPI: { updateProfile: vi.fn(), removePicture: vi.fn() },
}));

// The field's own picking and cropping is `UserFieldsForm`'s test; here it only has to
// hand the form an edit and show which one it holds.
vi.mock("@/components/user/picture-field", () => ({
  PictureField: ({
    edit,
    onChange,
  }: {
    edit: PictureEdit | null;
    onChange: (edit: PictureEdit | null) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onChange({ kind: "remove" })}>
        Remove portrait
      </button>
      <span>pending: {edit?.kind ?? "none"}</span>
    </div>
  ),
}));

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const { authAPI } = await import("@/lib/api/auth");

let sent: string[] = [];
const onSaved = vi.fn();

beforeEach(() => {
  sent = [];
  Object.assign(checkin.details, { email: null });
  checkin.save
    .mockReset()
    .mockImplementation(async (patch: CheckinDetailsUpdate) => {
      sent.push("patch details");
      Object.assign(checkin.details, patch);
      return checkin.details;
    });
  auth.refreshUser.mockReset().mockResolvedValue(undefined);
  vi.mocked(authAPI.removePicture)
    .mockReset()
    .mockImplementation(async () => {
      sent.push("delete");
      return { message: "ok" };
    });
  toast.mockReset();
  onSaved.mockReset();
});

function renderForm() {
  return render(
    <CheckinDetailsForm group="about" picture="portrait" onSaved={onSaved}>
      <UserFieldsSubmitButton />
    </CheckinDetailsForm>,
  );
}

const save = () =>
  userEvent.click(screen.getByRole("button", { name: /save changes/i }));

describe("a portrait that fails after the details saved", () => {
  it("stays picked, keeps the dialog open, and the next Save sends only it", async () => {
    vi.mocked(authAPI.removePicture).mockRejectedValueOnce(new Error("nope"));
    renderForm();

    await userEvent.type(screen.getByLabelText("Email"), "jane@dive.example");
    await userEvent.click(
      screen.getByRole("button", { name: "Remove portrait" }),
    );
    await save();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Saved, but your portrait did not",
        }),
      ),
    );
    expect(sent).toEqual(["patch details"]);
    expect(screen.getByText("pending: remove")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();

    await save();

    await waitFor(() => expect(sent).toEqual(["patch details", "delete"]));
    expect(screen.getByText("pending: none")).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
