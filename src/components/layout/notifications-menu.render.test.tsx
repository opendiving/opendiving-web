import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationsMenu } from "./notifications-menu";
import type { User } from "@/lib/api/auth";
import {
  certificationsAPI,
  type CertificationExpiringEntry,
} from "@/lib/api/certifications";
import {
  gearServiceAPI,
  type GearServiceDueEntry,
} from "@/lib/api/gear-service";
import { isoDaysFromNow } from "@/test/local-day";

// The bell holds two lists behind one count: gear due a service, and anything about to
// run out - certifications, and the dive insurance among them, since a lapsed policy
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
}));

vi.mock("@/lib/api/gear-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/gear-service")>();
  return {
    ...actual,
    gearServiceAPI: { ...actual.gearServiceAPI, getDue: vi.fn() },
  };
});

vi.mock("@/lib/api/certifications", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  certificationsAPI: { getExpiring: vi.fn() },
}));

const getDue = vi.mocked(gearServiceAPI.getDue);
const getExpiring = vi.mocked(certificationsAPI.getExpiring);

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

// Renders the bell, opens the panel, and waits for both reads to land in it.
const openPanel = async () => {
  render(<NotificationsMenu />);
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
  Object.assign(stable.auth.user, {
    insurance_provider: null,
    insurance_expires_on: null,
  });
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
    Object.assign(stable.auth.user, { insurance_expires_on: soon() });

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
  it("says so rather than claiming nothing is due", async () => {
    getDue.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const panel = await openPanel();

    expect(panel).toHaveTextContent("Couldn't check your gear's service");
    expect(panel).not.toHaveTextContent("Nothing needs your attention");
  });

  it("still shows the insurance, which the certifications read does not carry", async () => {
    getExpiring.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.assign(stable.auth.user, {
      insurance_provider: "DAN Europe",
      insurance_expires_on: soon(),
    });

    const panel = await openPanel();

    expect(within(panel).getByText("DAN Europe")).toBeInTheDocument();
    expect(panel).toHaveTextContent("Couldn't check your certifications");
  });
});

// The log-service button on each row is icon-only, and this list spans every item a
// diver owns - so its name has to say which item as well as which schedule. The
// fixtures hold several rows on purpose: a name built from a constant passes a one-row
// test exactly as well as one built from the entry.
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
      .map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual([
      "Log service for Visual inspection on Scubapro MK25 EVO",
      "Log service for Hydrostatic test on Scubapro MK25 EVO",
      "Log service for Service on Scubapro R195",
      "Log service for Service (Second stage) on MK25 EVO",
    ]);
    expect(within(panel).getByRole("link", { name: /R195/ })).toHaveAttribute(
      "href",
      "/gear/item-2",
    );
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
});

describe("the renewals rows", () => {
  it("shows a policy inside the horizon, named by the provider", async () => {
    Object.assign(stable.auth.user, {
      insurance_provider: "DAN Europe",
      insurance_expires_on: soon(),
    });

    const panel = await openPanel();

    expect(within(panel).getByText("Dive insurance")).toBeInTheDocument();
    // `/settings/checkin` is where the policy is entered; certifications go to their
    // own page.
    expect(
      within(panel).getByRole("link", { name: /DAN Europe/ }),
    ).toHaveAttribute("href", "/settings/checkin");
    expect(
      within(panel).getByRole("heading", { name: "Renewals" }),
    ).toBeInTheDocument();
  });

  it("says what is running out when no provider was named", async () => {
    Object.assign(stable.auth.user, { insurance_expires_on: soon() });

    const panel = await openPanel();

    expect(within(panel).getByText("Dive insurance")).toBeInTheDocument();
  });

  it("puts the policy in one list with the cards, soonest first", async () => {
    getExpiring.mockResolvedValue({
      data: [certification({ expires_on: isoDaysFromNow(60) })],
    });
    Object.assign(stable.auth.user, {
      insurance_provider: "DAN Europe",
      insurance_expires_on: isoDaysFromNow(10),
    });

    const panel = await openPanel();

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
  });
});
