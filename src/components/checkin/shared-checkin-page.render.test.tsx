import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SharedCheckInPage } from "./shared-checkin-page";
import { API_BASE_URL } from "@/lib/api-base";
import type { SharedCheckIn } from "@/lib/api/checkin-links";

// The page a desk opens. What it may never do is reach for the session: no signed-in
// client, no blob fetch, no auth guard - the token in the URL is the only credential,
// and a desk's phone has no account to offer anyway.
const spies = vi.hoisted(() => ({
  apiGet: vi.fn(),
  blobUrl: vi.fn(),
  useAuth: vi.fn(),
  useAuthGuard: vi.fn(),
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiClient: { get: spies.apiGet, post: spies.apiGet, delete: spies.apiGet },
}));
vi.mock("@/hooks/useAuthedBlobUrl", () => ({
  useAuthedBlobUrl: spies.blobUrl,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: spies.useAuth }));
vi.mock("@/hooks/useAuthGuard", () => ({ useAuthGuard: spies.useAuthGuard }));

const SUMMARY: SharedCheckIn = {
  expires_at: "2026-09-27T10:00:00Z",
  diver: {
    name: "Sam Reef",
    portrait_sha256: "portrait1",
    units: "imperial",
    date_of_birth: "1988-04-02",
    phone: "+44 7700 900000",
    insurance_provider: "DAN Europe",
    insurance_policy_number: "P-42",
    insurance_expires_on: null,
    emergency_contact_name: "Alex Reef",
    emergency_contact_phone: "+44 7700 900111",
    emergency_contact_relationship: null,
  },
  diving: { total_dives: 310, max_depth: 39.6, last_dive_on: "2026-08-14" },
  certifications: [
    {
      uuid: "cert-1",
      agency: "padi",
      name: "Rescue Diver",
      contact_name: "Blue Ocean",
      front_content_type: "image/png",
    },
  ],
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  for (const spy of Object.values(spies)) spy.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

describe("SharedCheckInPage", () => {
  it("draws the diver's sheet from the summary, read-only", async () => {
    fetchMock.mockResolvedValue(answer(200, SUMMARY));
    const { container } = render(<SharedCheckInPage token="tok" />);

    expect(await screen.findByText("PADI Rescue Diver")).toBeInTheDocument();
    // The figures the link was made with, in the diver's own units.
    expect(screen.getByText("310")).toBeInTheDocument();
    expect(screen.getByText("130 ft")).toBeInTheDocument();
    expect(screen.getByText("Blue Ocean")).toBeInTheDocument();
    expect(screen.getByText(/This link stops working on/)).toBeInTheDocument();

    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["Print"]);
    for (const img of container.querySelectorAll("img")) {
      expect(img.getAttribute("src")).toMatch(
        new RegExp(`^${API_BASE_URL}/checkin/tok/`),
      );
    }
    expect(container.querySelectorAll("img")).toHaveLength(2);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/checkin/tok`);
    expect(init.credentials).toBe("omit");
    for (const spy of Object.values(spies)) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("says a dead link is dead, without saying why", async () => {
    fetchMock.mockResolvedValue(answer(404, { detail: "Not found" }));
    render(<SharedCheckInPage token="gone" />);

    expect(
      await screen.findByRole("heading", {
        name: "This check-in link is no longer valid",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/It has expired or was revoked/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Diver Check-in")).toBeNull();
  });

  it("offers another try when the request itself fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fetchMock.mockResolvedValueOnce(answer(200, SUMMARY));
    render(<SharedCheckInPage token="tok" />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    expect(await screen.findByText("PADI Rescue Diver")).toBeInTheDocument();
  });
});
