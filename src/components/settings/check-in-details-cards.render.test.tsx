import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AboutYouCard,
  CheckInDetailsCard,
  DiveInsuranceCard,
  EmergencyContactsCard,
} from "./check-in-details-cards";
import { CheckInPageFrame } from "@/components/checkin/checkin-page-frame";
import {
  CheckinDetailsProvider,
  useCheckinDetails,
} from "@/contexts/CheckinDetailsContext";
import type { User } from "@/lib/api/auth";
import type {
  CheckinDetails,
  CheckinDetailsUpdate,
} from "@/lib/api/checkin-details";
import { ownCheckInDiver } from "@/lib/checkin";
import { isoDaysFromNow } from "@/test/local-day";

// What a render reaches here is the wiring: that each card's save sends its own group
// and no other key, whatever the shared copy holds; that a save on one card is what
// every other surface shows at once; and that nothing offers a Save before the copy
// has arrived.

// Hoisted and returned by identity, as the real `AuthContext` holds it in state. See
// "The new-dive render test was in a loop with itself" in DECISIONS.md.
const auth = vi.hoisted(() => ({
  user: {
    uuid: "user-1",
    name: "Sam",
    username: "sam",
    email: "sam@example.com",
    units: "metric",
    dive_form_hidden_fields: [],
    dive_form_preset_uuid: null,
  } as User,
  refreshUser: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("@/lib/api/auth", () => ({
  authAPI: { updateProfile: vi.fn() },
}));

vi.mock("@/lib/api/checkin-details", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  checkinDetailsAPI: { get: vi.fn(), update: vi.fn() },
}));

vi.mock("@/hooks/useAuthedBlobUrl", () => ({
  useAuthedBlobUrl: () => ({
    url: null,
    isLoading: false,
    hasError: false,
    error: null,
  }),
}));

vi.mock("@/components/ui/use-toast", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
}));

const { authAPI } = await import("@/lib/api/auth");
const { checkinDetailsAPI } = await import("@/lib/api/checkin-details");
const get = vi.mocked(checkinDetailsAPI.get);
const update = vi.mocked(checkinDetailsAPI.update);

// The account's stored object, which `update` writes the way the API does - each key
// present replacing its member - and answers whole.
let server: CheckinDetails;
const empty = (): CheckinDetails => ({
  email: null,
  phone: null,
  date_of_birth: null,
  emergency_contacts: [],
  insurance_policies: [],
});

beforeEach(() => {
  server = empty();
  get.mockReset().mockImplementation(async () => structuredClone(server));
  update.mockReset().mockImplementation(async (patch: CheckinDetailsUpdate) => {
    server = { ...server, ...patch };
    return structuredClone(server);
  });
  auth.refreshUser.mockReset().mockResolvedValue(undefined);
  vi.mocked(authAPI.updateProfile).mockReset().mockResolvedValue(undefined);
});

const withCopy = (ui: React.ReactNode) =>
  render(<CheckinDetailsProvider>{ui}</CheckinDetailsProvider>);

const saveButtons = () =>
  screen.queryAllByRole("button", { name: /save changes/i });
const save = async (index = 0) =>
  userEvent.click(
    (await screen.findAllByRole("button", { name: /save changes/i }))[index],
  );

describe("CheckInDetailsCard", () => {
  it("leads to the check-in page, from beside its heading", () => {
    render(<CheckInDetailsCard />);

    expect(screen.getByRole("link", { name: "Check-in" })).toHaveAttribute(
      "href",
      "/checkin",
    );
    expect(
      screen.getByRole("heading", { name: "Check-in Details" }),
    ).toBeInTheDocument();
  });
});

describe("before the shared copy has arrived", () => {
  it("offers no Save while it is on its way", async () => {
    get.mockReturnValue(new Promise(() => {}));
    withCopy(<AboutYouCard />);

    expect(
      screen.getByRole("status", { name: "Loading your check-in details" }),
    ).toBeInTheDocument();
    expect(saveButtons()).toHaveLength(0);
    expect(update).not.toHaveBeenCalled();
  });

  it("says so when it failed, sends nothing, and reads it again on Try again", async () => {
    get.mockRejectedValueOnce(new Error("down"));
    withCopy(<DiveInsuranceCard />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );

    expect(
      await screen.findByRole("button", { name: /save changes/i }),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
    expect(update).not.toHaveBeenCalled();
  });

  it("is read once, however many surfaces show it", async () => {
    withCopy(
      <>
        <AboutYouCard />
        <DiveInsuranceCard />
        <EmergencyContactsCard />
      </>,
    );

    await waitFor(() => expect(saveButtons()).toHaveLength(3));
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("AboutYouCard", () => {
  it("sends its own members and no other key", async () => {
    server.phone = "+44 7700 900000";
    withCopy(<AboutYouCard />);

    expect(await screen.findByLabelText("Phone number")).toHaveValue(
      "+44 7700 900000",
    );
    await userEvent.type(screen.getByLabelText("Email"), "desk@example.org");
    await save();

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        date_of_birth: null,
        phone: "+44 7700 900000",
        email: "desk@example.org",
      }),
    );
    // Nothing on the user record changed, so it is not read again.
    expect(auth.refreshUser).not.toHaveBeenCalled();
  });

  it("fills the sign-in email with one click, and sends nothing until Save", async () => {
    withCopy(<AboutYouCard />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Use my sign-in email" }),
    );

    expect(screen.getByLabelText("Email")).toHaveValue("sam@example.com");
    expect(update).not.toHaveBeenCalled();

    await save();
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ email: "sam@example.com" }),
      ),
    );
  });

  it("refuses a birth date in the future, and an email that is not one, before any request", async () => {
    withCopy(<AboutYouCard />);

    await userEvent.type(
      await screen.findByLabelText("Date of birth"),
      isoDaysFromNow(1),
    );
    // An address the browser's own check lets through, and the API would not take.
    await userEvent.type(screen.getByLabelText("Email"), "desk@example");
    await save();

    expect(
      await screen.findByText("Date of birth cannot be in the future"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Please enter a valid email address"),
    ).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("says so when the save fails", async () => {
    update.mockRejectedValue(new Error("nope"));
    withCopy(<AboutYouCard />);

    await save();

    expect(
      await screen.findByText("Failed to save. Please try again."),
    ).toBeInTheDocument();
  });
});

describe("DiveInsuranceCard", () => {
  it("sends the policies and no other key, even from a copy gone stale", async () => {
    server.insurance_policies = [
      { provider: "DAN Europe", number: null, expires_on: null },
    ];
    withCopy(<DiveInsuranceCard />);
    await screen.findByRole("button", { name: /save changes/i });

    // Another device saved a phone after this copy was read.
    server.phone = "0999";
    await userEvent.type(
      screen.getByRole("textbox", { name: "Policy number policy 1 of 1" }),
      "P-42",
    );
    await save();

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        insurance_policies: [
          { provider: "DAN Europe", number: "P-42", expires_on: null },
        ],
      }),
    );
    expect(server.phone).toBe("0999");
  });

  it("refuses a policy with no provider before any request", async () => {
    withCopy(<DiveInsuranceCard />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Add a policy" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Policy number policy 1 of 1" }),
      "P-42",
    );
    await save();

    expect(await screen.findByText("Enter the provider")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("EmergencyContactsCard", () => {
  it("sends a second contact moved first, first", async () => {
    server.emergency_contacts = [
      { name: "Alex", phone: "0456", relationship: "Partner" },
    ];
    withCopy(<EmergencyContactsCard />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Add a contact" }),
    );
    // Focus lands on the row just added.
    expect(
      screen.getByRole("textbox", { name: "Name contact 2 of 2" }),
    ).toHaveFocus();
    await userEvent.keyboard("Robin");
    screen
      .getByRole("button", { name: /^Reorder Robin, position 2 of 2/ })
      .focus();
    await userEvent.keyboard("{ArrowUp}");
    await save();

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        emergency_contacts: [
          { name: "Robin", phone: null, relationship: null },
          { name: "Alex", phone: "0456", relationship: "Partner" },
        ],
      }),
    );
  });

  it("clears the list with an empty one rather than leaving it behind", async () => {
    server.emergency_contacts = [
      { name: "Alex", phone: null, relationship: null },
    ];
    withCopy(<EmergencyContactsCard />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Remove Alex" }),
    );
    await save();

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ emergency_contacts: [] }),
    );
  });

  it("holds Add at the cap", async () => {
    server.emergency_contacts = Array.from({ length: 5 }, (_, i) => ({
      name: `Contact ${i}`,
      phone: null,
      relationship: null,
    }));
    withCopy(<EmergencyContactsCard />);

    expect(
      await screen.findByRole("button", { name: "Add a contact" }),
    ).toBeDisabled();
    expect(
      screen.getByText("5 contacts at most - remove one to add another."),
    ).toBeInTheDocument();
  });
});

// The signed-in sheet as `CheckInPageContent` builds it, beside the cards.
function Sheet() {
  const { details } = useCheckinDetails();
  return (
    <CheckInPageFrame
      diver={ownCheckInDiver(auth.user, details)}
      details={details ? undefined : "loading"}
      units="metric"
      isLoading={false}
    />
  );
}

describe("the cards side by side", () => {
  it("leaves both of two saves standing, on the copy and on the sheet", async () => {
    withCopy(
      <>
        <AboutYouCard />
        <DiveInsuranceCard />
        <Sheet />
      </>,
    );

    await userEvent.type(
      await screen.findByLabelText("Email"),
      "desk@example.org",
    );
    await save(0);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "Add a policy" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Provider policy 1 of 1" }),
      "DAN Europe",
    );
    await save(1);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));

    // The second body carried the policies alone, so the email stands.
    expect(update.mock.lastCall?.[0]).toEqual({
      insurance_policies: [
        { provider: "DAN Europe", number: null, expires_on: null },
      ],
    });
    expect(await screen.findByText("desk@example.org")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("desk@example.org");
    expect(screen.getAllByText("DAN Europe").length).toBeGreaterThan(0);
  });

  it("leaves what is typed in one card alone when another saves", async () => {
    withCopy(
      <>
        <AboutYouCard />
        <DiveInsuranceCard />
      </>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Add a policy" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Provider policy 1 of 1" }),
      "DAN Europe",
    );
    await userEvent.type(screen.getByLabelText("Phone number"), "0123");
    await save(0);
    await waitFor(() => expect(update).toHaveBeenCalled());

    expect(
      screen.getByRole("textbox", { name: "Provider policy 1 of 1" }),
    ).toHaveValue("DAN Europe");
    expect(screen.getByLabelText("Phone number")).toHaveValue("0123");
  });

  it("repaints the card that saved even when the stored value did not change", async () => {
    server.phone = "0123";
    withCopy(<AboutYouCard />);

    // Sent trimmed, so the stored value is the one already there.
    await userEvent.type(await screen.findByLabelText("Phone number"), " ");
    await save();

    await waitFor(() =>
      expect(screen.getByLabelText("Phone number")).toHaveValue("0123"),
    );
  });
});
