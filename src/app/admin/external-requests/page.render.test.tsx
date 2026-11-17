import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminExternalRequestsPage from "./page";
import {
  adminAPI,
  type AdminExternalRequestCount,
  type AdminExternalRequests,
} from "@/lib/api/admin";

vi.mock("@/lib/api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/admin")>();
  return { ...actual, adminAPI: { getExternalRequests: vi.fn() } };
});

const getExternalRequests = vi.mocked(adminAPI.getExternalRequests);

const count = (
  provider: string,
  kind: string,
  outcome: string,
  n: number,
  total = 0,
  slowest = 0,
): AdminExternalRequestCount => ({
  provider,
  kind,
  outcome,
  count: n,
  duration_ms_total: total,
  duration_ms_max: slowest,
});

const NOVEMBER: Record<string, AdminExternalRequestCount[]> = {
  "2026-11-03": [
    count("open-meteo", "forecast", "cache_hit", 5),
    count("open-meteo", "forecast", "deadline", 2, 20000, 10000),
    count("open-meteo", "sea", "ok", 41, 20500, 3100),
    count("open-meteo", "sea", "skipped", 1),
  ],
  "2026-11-04": [
    count("mystery", "lookup", "ok", 3, 300, 120),
    count("open-meteo", "sea", "brand_new", 1, 500, 500),
    count("open-meteo", "sea", "ok", 10, 1000, 200),
  ],
};

// Every day of the range asked for, the way the API answers, with `busy` laid
// over the days it names.
const answer = (
  from: string,
  to: string,
  busy: Record<string, AdminExternalRequestCount[]> = {},
): AdminExternalRequests => {
  const days = [];
  for (
    let at = Date.parse(`${from}T00:00:00Z`);
    at <= Date.parse(`${to}T00:00:00Z`);
    at += 86_400_000
  ) {
    const day = new Date(at).toISOString().slice(0, 10);
    days.push({ day, requests: busy[day] ?? [] });
  }
  return {
    from,
    to,
    providers: [
      { provider: "google", kinds: ["avatar"], limit: null },
      {
        provider: "open-meteo",
        kinds: ["forecast", "sea"],
        limit: { requests: 400, window_seconds: 3600, per_day: 9600 },
      },
    ],
    days,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  // Only `Date` is faked, so `waitFor` and user-event keep their real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 10, 17, 12));
  getExternalRequests.mockImplementation(async (from, to) =>
    answer(from, to, from.startsWith("2026-11") ? NOVEMBER : {}),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

const card = (title: string) =>
  screen
    .getByRole("heading", { name: title })
    .closest<HTMLElement>(".rounded-lg")!;

const loaded = () => screen.findByRole("heading", { name: "open-meteo" });

const servicesRow = (service: string) =>
  within(card("Services"))
    .getByRole("rowheader", { name: service })
    .closest("tr")!;

describe("the External Requests screen", () => {
  it("asks for the current UTC month, once", async () => {
    render(<AdminExternalRequestsPage />);

    await loaded();
    expect(getExternalRequests).toHaveBeenCalledTimes(1);
    expect(getExternalRequests).toHaveBeenCalledWith(
      "2026-11-01",
      "2026-11-30",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "External Requests" }),
    ).toBeInTheDocument();
  });

  it("lists every service, one the API did not list among them, under Service", async () => {
    render(<AdminExternalRequestsPage />);
    await loaded();

    const services = within(card("Services"));
    expect(
      services.getByRole("columnheader", { name: "Service" }),
    ).toBeInTheDocument();
    expect(
      services.getAllByRole("rowheader").map((cell) => cell.textContent),
    ).toEqual(["google", "open-meteo", "mystery"]);
    expect(
      within(card("google")).getByText("No requests in November 2026."),
    ).toBeInTheDocument();
  });

  it("tells sent requests from the events that sent nothing", async () => {
    render(<AdminExternalRequestsPage />);
    await loaded();

    const services = within(card("Services"));
    expect(
      services.getByRole("columnheader", { name: "Sent to the service" }),
    ).toBeInTheDocument();
    expect(
      services.getByRole("columnheader", { name: "Not sent" }),
    ).toBeInTheDocument();
    // 41 + 2 + 10 + 1 sent, of which the timeouts and the unknown outcome failed;
    // one held back by the instance's own limit, five answered from the cache.
    const cells = within(servicesRow("open-meteo"))
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells.slice(0, 4)).toEqual(["54", "3", "1", "5"]);
  });

  it("shows the busiest day against the daily limit in figures, and no proportion without one", async () => {
    render(<AdminExternalRequestsPage />);
    await loaded();

    const meteo = within(servicesRow("open-meteo"));
    expect(meteo.getByText(/43 of 9,600/)).toHaveTextContent(
      "43 of 9,600 on November 3",
    );
    expect(meteo.getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      "43 of 9,600 a day",
    );
    expect(within(servicesRow("google")).queryByRole("meter")).toBeNull();
    expect(within(servicesRow("mystery")).queryByRole("meter")).toBeNull();
  });

  it("splits a service's outcomes and durations by kind, an unknown outcome under its slug", async () => {
    render(<AdminExternalRequestsPage />);
    await loaded();

    const meteo = within(card("open-meteo"));
    expect(
      meteo.getByText("Own limit: 400 requests an hour, at most 9,600 a day."),
    ).toBeInTheDocument();
    expect(
      meteo.getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual(["Outcome", "All", "forecast", "sea"]);

    const row = (name: string) =>
      within(meteo.getByRole("rowheader", { name }).closest("tr")!)
        .getAllByRole("cell")
        .map((cell) => cell.textContent);
    expect(row("Requests")).toEqual(["54", "2", "52"]);
    expect(row("Answered")).toEqual(["51", "0", "51"]);
    expect(row("Timed out")).toEqual(["2", "2", "0"]);
    expect(row("Too many requests")).toEqual(["0", "0", "0"]);
    expect(row("brand_new")).toEqual(["1", "0", "1"]);
    // (20000 + 20500 + 500 + 1000) / 54 sent.
    expect(row("Average time")).toEqual(["778 ms", "10.0 s", "423 ms"]);
    expect(row("Slowest")).toEqual(["10.0 s", "10.0 s", "3.1 s"]);
    expect(row("Own limit reached")).toEqual(["1", "0", "1"]);
    expect(row("From cache")).toEqual(["5", "5", "0"]);

    expect(
      within(card("mystery")).getByRole("columnheader", { name: "lookup" }),
    ).toBeInTheDocument();
  });

  it("says for each day how many requests each service was sent, and how many failed", async () => {
    render(<AdminExternalRequestsPage />);
    await loaded();

    const daily = within(card("Each day"));
    expect(
      daily.getByRole("img", {
        name: "Requests sent per day in November 2026, by service, 57 in total. Busiest day: November 3, with 43.",
      }),
    ).toBeInTheDocument();
    const rows = daily
      .getAllByRole("row")
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent),
      );
    expect(rows).toEqual([
      ["November 3", "open-meteo", "43", "2"],
      ["November 4", "open-meteo", "11", "1"],
      ["", "mystery", "3", "0"],
    ]);
  });

  it("steps back a month at a time, never past this one, and says when a month is empty", async () => {
    const user = userEvent.setup();
    render(<AdminExternalRequestsPage />);
    await loaded();

    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await waitFor(() =>
      expect(getExternalRequests).toHaveBeenLastCalledWith(
        "2026-10-01",
        "2026-10-31",
      ),
    );
    expect(
      await within(card("Services")).findByText(
        "No requests were sent in October 2026.",
      ),
    ).toBeInTheDocument();
    expect(
      within(card("open-meteo")).getByText("No requests in October 2026."),
    ).toBeInTheDocument();
    expect(within(card("Each day")).queryByRole("table")).toBeNull();
  });

  it("shows the API's message when the request fails, and tries again", async () => {
    getExternalRequests.mockRejectedValueOnce({
      response: { data: { detail: "A range is at most 92 days." } },
    });
    const user = userEvent.setup();
    render(<AdminExternalRequestsPage />);

    expect(
      await screen.findByText("A range is at most 92 days."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await loaded()).toBeInTheDocument();
  });
});
