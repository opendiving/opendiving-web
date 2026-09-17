import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CheckInPage from "./page";
import type { UserDiveStats } from "@/lib/api/dive-stats";

// The page reads three unrelated endpoints, and what is worth pinning is that they
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

const getCertifications = vi.mocked(fetchAllCertifications);
const getDiveStats = vi.mocked(diveStatsAPI.getDiveStats);
const getDives = vi.mocked(divesAPI.getDives);

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
    user_uuid: "user-1",
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
    expect(retry()).toBeNull();
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

  it("keeps the dive count when the certifications fail", async () => {
    getCertifications.mockRejectedValue(new Error("500"));
    render(<CheckInPage />);

    expect(await screen.findByText("142")).toBeInTheDocument();
    expect(screen.queryByText("PADI Rescue Diver")).toBeNull();
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
