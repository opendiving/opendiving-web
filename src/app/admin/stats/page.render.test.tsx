import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminStatsPage from "./page";
import { adminAPI, type AdminStats, type AdminStatsDay } from "@/lib/api/admin";
import { monthRange } from "@/components/admin/daily-stats";

vi.mock("@/lib/api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/admin")>();
  return { ...actual, adminAPI: { getStats: vi.fn() } };
});

const getStats = vi.mocked(adminAPI.getStats);

// Every day of the range asked for, zero-filled the way the API answers, with
// `busy` laid over the days it names.
const answer = (
  from: string,
  to: string,
  busy: Record<string, Partial<AdminStatsDay>> = {},
): AdminStats => {
  const days: AdminStatsDay[] = [];
  for (
    let at = Date.parse(`${from}T00:00:00Z`);
    at <= Date.parse(`${to}T00:00:00Z`);
    at += 86_400_000
  ) {
    const day = new Date(at).toISOString().slice(0, 10);
    days.push({
      day,
      accounts_created: {},
      sign_ins: 0,
      active_accounts: 0,
      ...busy[day],
    });
  }
  return {
    from,
    to,
    channels: [
      { slug: "scubaboard", label: "ScubaBoard" },
      { slug: "reddit", label: "Reddit" },
    ],
    days,
    totals: { accounts: 57, active_now: 21 },
  };
};

const SEPTEMBER: Record<string, Partial<AdminStatsDay>> = {
  "2026-09-01": {
    accounts_created: { scubaboard: 3, waitlist: 1 },
    sign_ins: 12,
    active_accounts: 20,
  },
  "2026-09-02": {
    accounts_created: { instagram: 2, invitation: 1 },
    sign_ins: 4,
    active_accounts: 10,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Only `Date` is faked, so `waitFor` and user-event keep their real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 8, 2, 12));
  getStats.mockImplementation(async (from, to) =>
    answer(from, to, from.startsWith("2026-09") ? SEPTEMBER : {}),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

const card = (title: string) =>
  screen
    .getByRole("heading", { name: title })
    .closest<HTMLElement>(".rounded-lg")!;

describe("the stats screen", () => {
  it("asks for the current UTC month, once", async () => {
    render(<AdminStatsPage />);

    await screen.findByText("57");
    expect(getStats).toHaveBeenCalledTimes(1);
    expect(getStats).toHaveBeenCalledWith("2026-09-01", "2026-09-30");
    expect(screen.getByText("September 2026")).toBeInTheDocument();
  });

  it("names every door in the new-accounts key", async () => {
    render(<AdminStatsPage />);
    await screen.findByText("57");

    const key = within(card("New accounts"));
    for (const name of [
      "ScubaBoard",
      "Reddit",
      "instagram",
      "Waiting list",
      "Member invitation",
    ]) {
      expect(key.getByText(name)).toBeInTheDocument();
    }
    expect(key.queryByText("Open registration")).not.toBeInTheDocument();
    expect(
      key.getByRole("img", {
        name: "New accounts per day in September 2026, 7 in total. Busiest day: September 1, with 4.",
      }),
    ).toBeInTheDocument();
  });

  it("draws sign-ins and active accounts as two series", async () => {
    render(<AdminStatsPage />);
    await screen.findByText("57");

    const activity = within(card("Activity"));
    expect(activity.getByText("Sign-ins")).toBeInTheDocument();
    expect(activity.getByText("Active accounts")).toBeInTheDocument();
    // The screen reader's day-by-day list.
    expect(
      activity.getByText("September 1: Sign-ins 12, Active accounts 20", {
        selector: "li",
      }),
    ).toBeInTheDocument();
  });

  it("totals accounts, active now, and the month's peak and average daily active", async () => {
    render(<AdminStatsPage />);
    await screen.findByText("57");

    const totals = within(card("Totals"));
    expect(totals.getByText("21")).toBeInTheDocument();
    expect(totals.getByText("20")).toBeInTheDocument();
    expect(totals.getByText("on September 1")).toBeInTheDocument();
    // Two days have happened: (20 + 10) / 2.
    expect(totals.getByText("15.0")).toBeInTheDocument();
    expect(screen.queryByText(/7-day|30-day|30 days|7 days/i)).toBeNull();
  });

  it("steps back one month at a time, and never past this one", async () => {
    const user = userEvent.setup();
    render(<AdminStatsPage />);
    await screen.findByText("57");

    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await screen.findByText("August 2026");
    await waitFor(() =>
      expect(getStats).toHaveBeenLastCalledWith(
        ...Object.values(monthRange("2026-08")),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await waitFor(() =>
      expect(getStats).toHaveBeenLastCalledWith("2026-07-01", "2026-07-31"),
    );
    expect(getStats).toHaveBeenCalledTimes(3);
  });

  it("draws the axes of an empty month and says so", async () => {
    const user = userEvent.setup();
    render(<AdminStatsPage />);
    await screen.findByText("57");

    await user.click(screen.getByRole("button", { name: "Previous month" }));

    expect(
      await screen.findByText("No accounts were created in August 2026."),
    ).toBeInTheDocument();
    const chart = within(card("New accounts")).getByRole("img");
    expect(chart.querySelectorAll("line").length).toBeGreaterThan(1);
    expect(chart).toHaveAccessibleName(
      "New accounts per day in August 2026: none.",
    );
    expect(
      screen.getByText(
        "No account signed in or used a session in August 2026.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the API's message when the request fails, and tries again", async () => {
    getStats.mockRejectedValueOnce({
      response: { data: { detail: "A range is at most 92 days." } },
    });
    const user = userEvent.setup();
    render(<AdminStatsPage />);

    expect(
      await screen.findByText("A range is at most 92 days."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("57")).toBeInTheDocument();
  });
});
