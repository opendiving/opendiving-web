import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  render as rtlRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CheckInPage from "./page";
import type { UserDiveStats } from "@/lib/api/dive-stats";
import { CheckinDetailsProvider } from "@/contexts/CheckinDetailsContext";

// The page reads several unrelated endpoints, and what is worth pinning is that they
// stay unrelated: a summary handed across a desk missing its c-cards because the
// dive-count endpoint was down is the failure this page can least afford.

// Returned by identity rather than rebuilt per call: the real `AuthContext` holds
// `user` in state and keeps one identity across renders, and this page's effect is
// keyed on the uuid. See "The new-dive render test was in a loop with itself" in
// DECISIONS.md.
const stable = vi.hoisted(() => ({
  guard: {
    user: { uuid: "user-1", name: "Sam Reef" },
    isAuthenticated: true,
    isLoading: false,
  },
  auth: { user: { uuid: "user-1", name: "Sam Reef", units: "metric" } },
}));

vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => stable.guard,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => stable.auth,
}));

vi.mock("@/lib/api/certifications", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchAllCertifications: vi.fn(),
}));

vi.mock("@/lib/api/dive-stats", () => ({
  diveStatsAPI: { getDiveStats: vi.fn() },
}));

vi.mock("@/lib/api/dives", () => ({
  divesAPI: { getDives: vi.fn() },
}));

vi.mock("@/lib/api/contacts", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchAllContacts: vi.fn(),
}));

vi.mock("@/lib/api/people", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchAllPeople: vi.fn(),
}));

vi.mock("@/lib/api/checkin-links", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  checkinLinkAPI: { mint: vi.fn(), live: vi.fn(), revoke: vi.fn() },
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

const { fetchAllCertifications } = await import("@/lib/api/certifications");
const { diveStatsAPI } = await import("@/lib/api/dive-stats");
const { divesAPI } = await import("@/lib/api/dives");
const { fetchAllContacts } = await import("@/lib/api/contacts");
const { fetchAllPeople } = await import("@/lib/api/people");
const { checkinLinkAPI } = await import("@/lib/api/checkin-links");
const { checkinDetailsAPI } = await import("@/lib/api/checkin-details");
const getDetails = vi.mocked(checkinDetailsAPI.get);

// Under the root layout's provider, which holds the check-in details.
const render = (ui: React.ReactElement) =>
  rtlRender(ui, { wrapper: CheckinDetailsProvider });

const getCertifications = vi.mocked(fetchAllCertifications);
const getDiveStats = vi.mocked(diveStatsAPI.getDiveStats);
const getDives = vi.mocked(divesAPI.getDives);
const getContacts = vi.mocked(fetchAllContacts);
const getPeople = vi.mocked(fetchAllPeople);
const mintLink = vi.mocked(checkinLinkAPI.mint);
const liveLink = vi.mocked(checkinLinkAPI.live);
const revokeLink = vi.mocked(checkinLinkAPI.revoke);

const stats: UserDiveStats = {
  user_uuid: "user-1",
  total_dives: 142,
  max_depth: 39.6,
  total_time: 360000,
  species_seen: 12,
  created_at: "2026-01-01T00:00:00+00:00",
};

const oneCard = [
  {
    uuid: "cert-1",
    agency: "padi" as const,
    name: "Rescue Diver",
    contact_uuid: "contact-1",
    instructor_uuid: "person-1",
    user_uuid: "user-1",
    created_at: "2026-01-01T00:00:00+00:00",
  },
];

const theirShop = [
  {
    uuid: "contact-1",
    name: "Blue Ocean",
    roles: ["school"],
    notes: "",
    user_uuid: "user-1",
    created_at: "2026-01-01T00:00:00+00:00",
  },
];

const theirInstructor = [
  {
    uuid: "person-1",
    name: "Alex Diver",
    notes: "",
    username: null,
    dive_count: 0,
    created_at: "2026-01-01T00:00:00+00:00",
  },
];

const noDives = {
  data: [],
  total_count: 0,
  has_more: false,
  page: 1,
  items_per_page: 1,
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  getCertifications.mockReset().mockResolvedValue(oneCard);
  getDiveStats.mockReset().mockResolvedValue(stats);
  getDives.mockReset().mockResolvedValue(noDives);
  getContacts.mockReset().mockResolvedValue(theirShop);
  getPeople.mockReset().mockResolvedValue(theirInstructor);
  mintLink.mockReset().mockResolvedValue({
    token: "tok-1",
    expires_at: "2026-09-27T10:00:00Z",
  });
  liveLink.mockReset().mockResolvedValue(null);
  revokeLink.mockReset().mockResolvedValue(undefined);
  getDetails.mockReset().mockResolvedValue({
    email: "desk@example.org",
    phone: null,
    date_of_birth: null,
    emergency_contacts: [
      { name: "Alex Reef", phone: null, relationship: null },
    ],
    insurance_policies: [],
  });
});

// Keyed on the retry control rather than on the banner's prose: the sentence carries
// a typographic apostrophe, and a straight one in the pattern matches nothing and
// asserts nothing.
const retry = () => screen.queryByRole("button", { name: "Try again" });

describe("CheckInPage", () => {
  it("draws the whole summary when every request answers", async () => {
    render(<CheckInPage />);

    expect(await screen.findByText("PADI Rescue Diver")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();
    // The card's dive center and instructor, by name: the card holds only
    // their uuids.
    expect(screen.getByText("Blue Ocean")).toBeInTheDocument();
    expect(screen.getByText("Alex Diver")).toBeInTheDocument();
    // The check-in details, from the shared copy rather than the session.
    expect(screen.getByText("desk@example.org")).toBeInTheDocument();
    expect(screen.getByText("Alex Reef")).toBeInTheDocument();
    expect(retry()).toBeNull();
  });

  it("says the summary is short when the check-in details fail, and reads them again", async () => {
    getDetails.mockRejectedValueOnce(new Error("500"));
    render(<CheckInPage />);

    expect(await screen.findByText("PADI Rescue Diver")).toBeInTheDocument();
    await waitFor(() => expect(retry()).not.toBeNull());
    expect(screen.queryByText("Not filled in yet.")).toBeNull();

    await userEvent.click(retry()!);

    expect(await screen.findByText("desk@example.org")).toBeInTheDocument();
    expect(getDetails).toHaveBeenCalledTimes(2);
  });

  it("keeps the cards when the people fail, and leaves their instructors off", async () => {
    getPeople.mockRejectedValue(new Error("500"));
    render(<CheckInPage />);

    expect(await screen.findByText("PADI Rescue Diver")).toBeInTheDocument();
    expect(screen.queryByText("Instructor")).toBeNull();
    expect(screen.getByText("Blue Ocean")).toBeInTheDocument();
    expect(retry()).not.toBeNull();
  });

  it("keeps the cards when the contacts fail, and leaves their dive centers off", async () => {
    getContacts.mockRejectedValue(new Error("500"));
    render(<CheckInPage />);

    expect(await screen.findByText("PADI Rescue Diver")).toBeInTheDocument();
    expect(screen.queryByText("Dive center")).toBeNull();
    expect(retry()).not.toBeNull();
  });

  it("keeps the c-cards when the dive stats fail, and says the summary is short", async () => {
    getDiveStats.mockRejectedValue(new Error("500"));
    render(<CheckInPage />);

    // The half a dive shop actually reads survives a failure that has nothing to
    // do with it.
    expect(await screen.findByText("PADI Rescue Diver")).toBeInTheDocument();
    expect(
      screen.getByText(/the summary below is incomplete/i),
    ).toBeInTheDocument();
    expect(retry()).not.toBeNull();
  });

  it("keeps the dive count when the certifications fail, and claims nothing about them", async () => {
    getCertifications.mockRejectedValue(new Error("500"));
    render(<CheckInPage />);

    expect(await screen.findByText("142")).toBeInTheDocument();
    expect(screen.queryByText("PADI Rescue Diver")).toBeNull();
    // A rejected list leaves the same empty array a diver with no cards has, so the
    // page must not read one as the other: "No certifications yet." to somebody who
    // holds six is a fact invented out of a network failure.
    expect(screen.queryByText("No certifications yet.")).toBeNull();
  });

  it("asks again on Try again", async () => {
    getCertifications.mockRejectedValueOnce(new Error("500"));
    render(<CheckInPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );

    expect(await screen.findByText("PADI Rescue Diver")).toBeInTheDocument();
    expect(retry()).toBeNull();
  });
});

describe("sharing the page", () => {
  const share = () => screen.getByRole("button", { name: /share/i });
  const panel = () => screen.queryByRole("region", { name: "Check-in link" });

  it("makes a link from the figures on the page, shows it, and revokes it", async () => {
    render(<CheckInPage />);
    await screen.findByText("PADI Rescue Diver");

    await userEvent.click(share());

    expect(mintLink).toHaveBeenCalledWith({
      total_dives: 142,
      max_depth: 39.6,
      last_dive_on: null,
    });
    const shown = await screen.findByRole("region", { name: "Check-in link" });
    expect(within(shown).getByLabelText("Link address")).toHaveValue(
      `${window.location.origin}/checkin/tok-1`,
    );
    expect(
      within(shown).getByRole("img", { name: /QR code/ }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(shown).getByRole("button", { name: "Revoke" }),
    );
    await waitFor(() => expect(panel()).toBeNull());
    expect(revokeLink).toHaveBeenCalled();
  });

  it("holds Share when the figures failed to load, and not when only the contacts did", async () => {
    getDiveStats.mockRejectedValueOnce(new Error("500"));
    render(<CheckInPage />);
    await screen.findByText("PADI Rescue Diver");
    expect(share()).toBeDisabled();

    getContacts.mockRejectedValueOnce(new Error("500"));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("142");
    expect(retry()).not.toBeNull();
    expect(share()).toBeEnabled();
  });

  it("finds a live link on a later visit, and says why it has no QR code", async () => {
    liveLink.mockResolvedValue({ expires_at: "2026-09-27T10:00:00Z" });
    render(<CheckInPage />);

    const found = await screen.findByRole("region", { name: "Check-in link" });
    expect(within(found).queryByRole("img")).toBeNull();
    expect(within(found).getByText(/can.t be shown again/)).toBeInTheDocument();
  });

  // A read that set out before the click must not put back the link the click just
  // replaced, and with it take the new one's QR code away.
  it("keeps a link made now over a read that answers after it", async () => {
    let answer: (value: { expires_at: string }) => void = () => {};
    liveLink.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    render(<CheckInPage />);
    await screen.findByText("PADI Rescue Diver");

    await userEvent.click(share());
    await screen.findByRole("img", { name: /QR code/ });

    answer({ expires_at: "2026-09-26T08:00:00Z" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole("img", { name: /QR code/ })).toBeInTheDocument();
  });
});
