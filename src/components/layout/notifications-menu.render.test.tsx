import { beforeEach, describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationsMenu } from "./notifications-menu";
import { CheckInPageFrame } from "@/components/checkin/checkin-page-frame";
import {
  CheckinDetailsProvider,
  useCheckinDetails,
} from "@/contexts/CheckinDetailsContext";
import type { User } from "@/lib/api/auth";
import {
  checkinDetailsAPI,
  type CheckinDetails,
  type CheckinDetailsUpdate,
  type InsurancePolicy,
} from "@/lib/api/checkin-details";
import { ownCheckInDiver } from "@/lib/checkin";
import {
  certificationsAPI,
  type CertificationExpiringEntry,
} from "@/lib/api/certifications";
import {
  gearServiceAPI,
  type GearServiceDueEntry,
} from "@/lib/api/gear-service";
import { onSavedElsewhere } from "@/lib/saved-elsewhere";
import { isoDaysFromNow } from "@/test/local-day";

// The bell holds two lists behind one count: gear due a service, and anything about to
// run out - certifications, and the insurance policies among them, since a lapsed policy
// stops a dive at the desk exactly as a lapsed rescue card does. What a render reaches
// is the count on the bell, which rows the panel holds and where each sends the diver,
// and what it says on the ordinary day when nothing is due.

// Returned by identity rather than rebuilt per call - the real `AuthContext` holds this
// in state. See "A shared mock response object hides a render loop" in DECISIONS.md.
const stable = vi.hoisted(() => ({
  pathname: "/dashboard",
  auth: {
    user: {
      uuid: "user-1",
      name: "Sam",
      username: "sam",
      email: "sam@example.com",
      units: "metric",
      dive_form_hidden_fields: [],
    } as User,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => stable.auth,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => stable.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/gear-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/gear-service")>();
  return {
    ...actual,
    gearServiceAPI: {
      ...actual.gearServiceAPI,
      getDue: vi.fn(),
      createRecord: vi.fn(),
    },
  };
});

// The policies come from the shared check-in details, which `update` writes as the API
// does.
vi.mock("@/lib/api/checkin-details", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  checkinDetailsAPI: { get: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/api/certifications", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  certificationsAPI: { getExpiring: vi.fn(), getCertification: vi.fn() },
}));

// The certification dialog is `certification-dialog.render.test.tsx`'s subject, and
// brings its course, contact and people pickers with it. What this file owns is which
// card the row hands it, and what happens once it is saved.
vi.mock("@/components/certifications/certification-dialog", () => ({
  // Closed - as the sheet keeps its own - it draws nothing.
  CertificationDialog: ({
    open,
    certification,
    onSaved,
  }: {
    open: boolean;
    certification: { name: string; expires_on: string } | null;
    onSaved: (saved: unknown) => void;
  }) =>
    open && certification ? (
      <div role="dialog" aria-label="Edit Certification">
        {certification.name} expires {certification.expires_on}
        <button type="button" onClick={() => onSaved(certification)}>
          Save
        </button>
      </div>
    ) : null,
}));

const getDue = vi.mocked(gearServiceAPI.getDue);
const getExpiring = vi.mocked(certificationsAPI.getExpiring);
const getCertification = vi.mocked(certificationsAPI.getCertification);

// Long past, so every row is overdue whenever this suite runs. Only the schedules
// `serviceStatus` calls something other than "ok" are listed, and a due date relative
// to today would make that depend on the clock.
const due = (
  overrides: Partial<GearServiceDueEntry> = {},
): GearServiceDueEntry => ({
  schedule_uuid: "schedule-1",
  kind: "service",
  next_due_on: "2020-01-01",
  gear_item_uuid: "item-1",
  gear_item_name: "MK25 EVO",
  gear_item_brand: "Scubapro",
  gear_item_dive_count: 12,
  ...overrides,
});

const certification = (
  overrides: Partial<CertificationExpiringEntry> = {},
): CertificationExpiringEntry => ({
  uuid: "cert-1",
  agency: "padi",
  name: "Rescue Diver",
  expires_on: isoDaysFromNow(30),
  ...overrides,
});

// Inside the 90-day window `certificationExpiryStatus` flags, and well outside it.
const soon = () => isoDaysFromNow(30);
const later = () => isoDaysFromNow(400);

let server: CheckinDetails;
const policy = (provider: string, expires_on: string): InsurancePolicy => ({
  provider,
  number: null,
  expires_on,
});

// Under the root layout's provider, as the header is.
const render = (ui: React.ReactElement) =>
  rtlRender(ui, { wrapper: CheckinDetailsProvider });

// Renders the bell, opens the panel, and waits for both reads to land in it.
const openPanel = async () => {
  render(<NotificationsMenu />);
  await vi.waitFor(() => expect(checkinDetailsAPI.get).toHaveBeenCalled());
  await userEvent.click(screen.getByRole("button", { name: /^Notifications/ }));
  const panel = await screen.findByRole("dialog", { name: "Notifications" });
  await vi.waitFor(() =>
    expect(within(panel).queryByRole("status")).not.toBeInTheDocument(),
  );
  return panel;
};

beforeEach(() => {
  vi.clearAllMocks();
  stable.pathname = "/dashboard";
  server = {
    email: null,
    phone: null,
    date_of_birth: null,
    emergency_contacts: [],
    insurance_policies: [],
  };
  vi.mocked(checkinDetailsAPI.get).mockImplementation(async () =>
    structuredClone(server),
  );
  vi.mocked(checkinDetailsAPI.update).mockImplementation(
    async (patch: CheckinDetailsUpdate) => {
      server = { ...server, ...patch };
      return structuredClone(server);
    },
  );
  getDue.mockResolvedValue({ data: [] });
  getExpiring.mockResolvedValue({ data: [] });
});

describe("the bell's count", () => {
  it("counts every flagged row across both lists", async () => {
    getDue.mockResolvedValue({
      data: [
        due(),
        // A schedule far in the future is returned too, and is not worth a count.
        due({ schedule_uuid: "schedule-2", next_due_on: "2999-01-01" }),
      ],
    });
    getExpiring.mockResolvedValue({ data: [certification()] });
    server.insurance_policies = [policy("DAN Europe", soon())];

    render(<NotificationsMenu />);

    const bell = await screen.findByRole("button", {
      name: "Notifications (3)",
    });
    expect(bell).toHaveTextContent("3");
  });

  it("carries no count when nothing is due", async () => {
    getDue.mockResolvedValue({
      data: [due({ next_due_on: "2999-01-01" })],
    });
    getExpiring.mockResolvedValue({
      data: [certification({ expires_on: later() })],
    });

    const panel = await openPanel();

    expect(
      screen.getByRole("button", { name: "Notifications" }).textContent,
    ).toBe("");
    expect(panel).toHaveTextContent("Nothing needs your attention");
  });

  it("caps the chip at two characters, and keeps the whole count in the name", async () => {
    getDue.mockResolvedValue({
      data: Array.from({ length: 12 }, (_, index) =>
        due({ schedule_uuid: `schedule-${index}` }),
      ),
    });

    render(<NotificationsMenu />);

    expect(
      await screen.findByRole("button", { name: "Notifications (12)" }),
    ).toHaveTextContent("9+");
  });

  it("reads both lists again on every navigation", async () => {
    // The header outlives the pages, and a page is where a service is logged or an
    // expiry date moved - a count read once would keep counting what was dealt with.
    const { rerender } = render(<NotificationsMenu />);
    await vi.waitFor(() => expect(getDue).toHaveBeenCalledTimes(1));

    stable.pathname = "/gear";
    rerender(<NotificationsMenu />);

    await vi.waitFor(() => expect(getDue).toHaveBeenCalledTimes(2));
    expect(getExpiring).toHaveBeenCalledTimes(2);
  });
});

describe("a failed read", () => {
  it("says the policies could not be checked rather than that nothing is due, and tries again on the next page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(checkinDetailsAPI.get).mockRejectedValue(new Error("offline"));

    const { rerender } = render(<NotificationsMenu />);
    await userEvent.click(
      screen.getByRole("button", { name: /^Notifications/ }),
    );
    const panel = await screen.findByRole("dialog", { name: "Notifications" });

    expect(
      await within(panel).findByText(/Couldn't check your insurance policies/),
    ).toBeInTheDocument();
    expect(panel).not.toHaveTextContent("Nothing needs your attention");
    const reads = vi.mocked(checkinDetailsAPI.get).mock.calls.length;

    vi.mocked(checkinDetailsAPI.get).mockImplementation(async () =>
      structuredClone(server),
    );
    server.insurance_policies = [policy("DAN Europe", soon())];
    stable.pathname = "/gear";
    rerender(<NotificationsMenu />);

    expect(
      await screen.findByRole("button", { name: "Notifications (1)" }),
    ).toBeInTheDocument();
    expect(vi.mocked(checkinDetailsAPI.get).mock.calls.length).toBeGreaterThan(
      reads,
    );
  });

  it("says so rather than claiming nothing is due", async () => {
    getDue.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const panel = await openPanel();

    expect(panel).toHaveTextContent("Couldn't check your gear's service");
    expect(panel).not.toHaveTextContent("Nothing needs your attention");
  });

  it("still shows the policies, which the certifications read does not carry", async () => {
    getExpiring.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.insurance_policies = [policy("DAN Europe", soon())];

    const panel = await openPanel();

    expect(await within(panel).findByText("DAN Europe")).toBeInTheDocument();
    expect(panel).toHaveTextContent("Couldn't check your certifications");
  });
});

// The row's log-service button has no words of its own - it is the row, stretched under
// the title's link - and this list spans every item a diver owns, so its name has to say
// which item as well as which schedule. The fixtures hold several rows on purpose: a
// name built from a constant passes a one-row test exactly as well as one built from
// the entry.
describe("the service-due rows", () => {
  it("names each row's button after its schedule and its gear item", async () => {
    // A cylinder carries its visual inspection and its hydro on different clocks, so one
    // item can hold two rows; and a diver with two regulators has the same kind twice.
    // Neither the item nor the schedule alone separates all four.
    getDue.mockResolvedValue({
      data: [
        due({ schedule_uuid: "schedule-1", kind: "visual_inspection" }),
        due({ schedule_uuid: "schedule-2", kind: "hydrostatic_test" }),
        due({
          schedule_uuid: "schedule-3",
          gear_item_uuid: "item-2",
          gear_item_name: "R195",
          gear_item_brand: "Scubapro",
        }),
        due({
          schedule_uuid: "schedule-4",
          label: "Second stage",
          gear_item_uuid: "item-3",
          gear_item_name: "MK25 EVO",
          gear_item_brand: null,
        }),
      ],
    });

    const panel = await openPanel();

    const names = within(panel)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(names).toEqual([
      "Log service for Visual inspection on Scubapro MK25 EVO",
      "Log service for Hydrostatic test on Scubapro MK25 EVO",
      "Log service for Service on Scubapro R195",
      "Log service for Service (Second stage) on MK25 EVO",
    ]);
    // And back from the item's page to the page the bell was opened on.
    expect(within(panel).getByRole("link", { name: /R195/ })).toHaveAttribute(
      "href",
      "/gear/item-2?from=%2Fdashboard",
    );
  });

  it("says how far past due without repeating the chip", async () => {
    getDue.mockResolvedValue({ data: [due()] });

    const panel = await openPanel();

    expect(within(panel).getByText("Overdue")).toBeInTheDocument();
    expect(within(panel).getByText(/^by \d+ days$/)).toBeInTheDocument();
    expect(within(panel).queryByText(/Overdue by/)).toBeNull();
  });

  it("names the item in the dialog the button opens, and closes the panel", async () => {
    // The dialog is the one place the row's context is gone: its title alone says
    // "Log Service" and nothing more.
    getDue.mockResolvedValue({ data: [due()] });

    const panel = await openPanel();
    await userEvent.click(
      within(panel).getByRole("button", {
        name: "Log service for Service on Scubapro MK25 EVO",
      }),
    );

    const dialog = await screen.findByRole("dialog", { name: /Log Service/ });
    expect(dialog).toHaveTextContent("Scubapro MK25 EVO");
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Notifications" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("tells the page under it which item a logged service was for", async () => {
    // The page may be that item's, showing the schedule this service just moved.
    getDue.mockResolvedValue({ data: [due()] });
    vi.mocked(gearServiceAPI.createRecord).mockResolvedValue(
      {} as Awaited<ReturnType<typeof gearServiceAPI.createRecord>>,
    );
    const heard = vi.fn();
    const stop = onSavedElsewhere("gear-service", heard);

    const panel = await openPanel();
    await userEvent.click(
      within(panel).getByRole("button", {
        name: "Log service for Service on Scubapro MK25 EVO",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: /Log Service/ });
    await userEvent.click(
      within(dialog).getByRole("button", { name: /Log service/ }),
    );

    await vi.waitFor(() =>
      expect(heard).toHaveBeenCalledWith({ gearItemUuid: "item-1" }),
    );
    expect(getDue).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe("the renewals rows", () => {
  it("shows a policy inside the horizon, named by the provider", async () => {
    server.insurance_policies = [policy("DAN Europe", soon())];

    const panel = await openPanel();

    expect(
      await within(panel).findByText("Dive insurance"),
    ).toBeInTheDocument();
    // `/settings/checkin` is where the policy is entered; certifications go to their
    // own page.
    expect(
      within(panel).getByRole("link", { name: /DAN Europe/ }),
    ).toHaveAttribute("href", "/settings/checkin");
    expect(
      within(panel).getByRole("heading", { name: "Renewals" }),
    ).toBeInTheDocument();
  });

  it("shows one row per expiring policy, each action naming its provider", async () => {
    server.insurance_policies = [
      policy("DAN Europe", soon()),
      policy("Not yet", later()),
      policy("DiveAssure", isoDaysFromNow(5)),
    ];

    const panel = await openPanel();

    expect(
      await within(panel).findByRole("button", {
        name: "Edit your DAN Europe policy",
      }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", {
        name: "Edit your DiveAssure policy",
      }),
    ).toBeInTheDocument();
    expect(within(panel).queryByText("Not yet")).toBeNull();
  });

  it("puts the policy in one list with the cards, soonest first", async () => {
    getExpiring.mockResolvedValue({
      data: [certification({ expires_on: isoDaysFromNow(60) })],
    });
    server.insurance_policies = [policy("DAN Europe", isoDaysFromNow(10))];

    const panel = await openPanel();
    await within(panel).findByText("DAN Europe");

    const text = panel.textContent ?? "";
    expect(text.indexOf("DAN Europe")).toBeLessThan(
      text.indexOf("Rescue Diver"),
    );
  });

  it("names a certification's agency and links it to the certifications page", async () => {
    getExpiring.mockResolvedValue({ data: [certification()] });

    const panel = await openPanel();

    expect(within(panel).getByText("PADI")).toBeInTheDocument();
    expect(
      within(panel).getByRole("link", { name: /Rescue Diver/ }),
    ).toHaveAttribute("href", "/certifications");
    expect(within(panel).queryByText("Dive insurance")).toBeNull();
    // The chip says "Expiring soon"; the line under it says only when.
    expect(within(panel).getByText(/^on /)).toBeInTheDocument();
    expect(within(panel).queryByText(/Expires/)).toBeNull();
  });

  it("opens a certification's own dialog on the whole card, read by its uuid", async () => {
    // The renewals read carries five fields of a card; the dialog edits all of them,
    // so the row reads the rest before it opens.
    const expiresOn = soon();
    getExpiring.mockResolvedValue({
      data: [certification({ uuid: "cert-7", expires_on: expiresOn })],
    });
    getCertification.mockResolvedValue({
      uuid: "cert-7",
      agency: "padi",
      name: "Rescue Diver",
      expires_on: expiresOn,
    } as Awaited<ReturnType<typeof certificationsAPI.getCertification>>);

    const panel = await openPanel();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Edit Rescue Diver" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Edit Certification",
    });
    expect(getCertification).toHaveBeenCalledWith("cert-7");
    expect(dialog).toHaveTextContent(`Rescue Diver expires ${expiresOn}`);
  });

  it("tells the page under it about the saved card, and reads itself again", async () => {
    // The page may be `/certifications` or `/checkin`, showing the card as it was.
    const saved = { uuid: "cert-7", name: "Rescue Diver", expires_on: later() };
    getExpiring.mockResolvedValue({
      data: [certification({ uuid: "cert-7" })],
    });
    getCertification.mockResolvedValue(
      saved as Awaited<ReturnType<typeof certificationsAPI.getCertification>>,
    );
    const heard = vi.fn();
    const stop = onSavedElsewhere("certification", heard);

    const panel = await openPanel();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Edit Rescue Diver" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit Certification",
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(heard).toHaveBeenCalledWith({ certification: saved });
    await vi.waitFor(() => expect(getExpiring).toHaveBeenCalledTimes(2));
    stop();
  });

  it("opens the check-in page's policies form, and a save there shows on a mounted sheet", async () => {
    const expiresOn = soon();
    server.insurance_policies = [policy("DAN Europe", expiresOn)];

    // The sheet the bell sits over, drawn from the same shared copy.
    function Sheet() {
      const { details } = useCheckinDetails();
      return (
        <CheckInPageFrame
          diver={ownCheckInDiver(stable.auth.user, details)}
          details={details ? undefined : "loading"}
          units="metric"
          isLoading={false}
        />
      );
    }
    render(
      <>
        <NotificationsMenu />
        <Sheet />
      </>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^Notifications/ }),
    );
    const panel = await screen.findByRole("dialog", { name: "Notifications" });
    await userEvent.click(
      await within(panel).findByRole("button", {
        name: "Edit your DAN Europe policy",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Dive Insurance",
    });
    expect(
      await within(dialog).findByDisplayValue("DAN Europe"),
    ).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue(expiresOn)).toBeInTheDocument();

    await userEvent.type(
      within(dialog).getByRole("textbox", {
        name: "Policy number policy 1 of 1",
      }),
      "P-42",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /save changes/i }),
    );

    expect(await screen.findByText("P-42")).toBeInTheDocument();
    expect(checkinDetailsAPI.update).toHaveBeenCalledWith({
      insurance_policies: [
        { provider: "DAN Europe", number: "P-42", expires_on: expiresOn },
      ],
    });
    expect(checkinDetailsAPI.get).toHaveBeenCalledTimes(1);
  });
});
