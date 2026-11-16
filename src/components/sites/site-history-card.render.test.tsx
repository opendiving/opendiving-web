import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SiteHistoryCard } from "./site-history-card";
import type { AdminDiveSiteHistoryEntry } from "@/lib/api/admin";
import type { DiveSiteHistoryEntry } from "@/lib/api/dive-sites";

const auth = vi.hoisted(() => ({ units: "metric" as "metric" | "imperial" }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: auth.units } }),
}));
vi.mock("@/lib/api/dive-sites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-sites")>()),
  diveSitesAPI: { getDiveSiteHistory: vi.fn() },
}));
vi.mock("@/lib/api/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/admin")>()),
  adminAPI: { getDiveSiteHistory: vi.fn() },
}));

const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const { adminAPI } = await import("@/lib/api/admin");
const getHistory = vi.mocked(diveSitesAPI.getDiveSiteHistory);
const getAdminHistory = vi.mocked(adminAPI.getDiveSiteHistory);

const page = <T,>(data: T[]) => ({
  data,
  total_count: data.length,
  has_more: false,
  page: 1,
  items_per_page: 100,
});

const entry = (
  over: Partial<DiveSiteHistoryEntry> = {},
): DiveSiteHistoryEntry => ({
  uuid: "entry-1",
  kind: "changed",
  created_at: "2026-11-10T12:00:00Z",
  made_by: null,
  details: [],
  ...over,
});

const adminEntry = (
  over: Partial<AdminDiveSiteHistoryEntry> = {},
): AdminDiveSiteHistoryEntry => ({
  ...entry(),
  show_proposer: false,
  reviewed_by: "Rita Reviewer",
  corrected: false,
  ...over,
});

const answer = (data: DiveSiteHistoryEntry[]) =>
  getHistory.mockResolvedValue(page(data));

const card = async () => {
  await screen.findByRole("heading", { name: "History" });
  return document.body;
};

// The entries, without the reviewer's lines nested in each.
const entries = async () =>
  [...(await card()).querySelector("ul")!.children] as HTMLElement[];

beforeEach(() => {
  auth.units = "metric";
  getHistory.mockReset();
  getAdminHistory.mockReset();
});

describe("SiteHistoryCard", () => {
  it("lists entries newest first, each with its verb, any name and the date", async () => {
    answer([
      entry({ uuid: "b", made_by: "Ada Diver" }),
      entry({ uuid: "a", kind: "added", created_at: "2026-11-01T12:00:00Z" }),
    ]);
    render(<SiteHistoryCard siteUuid="site-1" asReviewer={false} />);

    const items = await entries();
    expect(items[0]).toHaveTextContent(/^Changed by Ada Diver · Nov 10, 2026$/);
    // No name, and nothing in its place.
    expect(items[1]).toHaveTextContent(/^Added · Nov 1, 2026$/);
    expect(getHistory).toHaveBeenCalledWith("site-1", 1, 100);
    expect(getAdminHistory).not.toHaveBeenCalled();
  });

  it("shows each member's old and new value as the page formats it, in the diver's units", async () => {
    auth.units = "imperial";
    answer([
      entry({
        details: [
          { field: "name", old: "Kapal Polis", new: "Kapal Polisi" },
          { field: "other_names", old: [], new: ["KP", "Police Wreck"] },
          { field: "location_name", old: null, new: "Tulamben" },
          { field: "depth_from", old: 5, new: 6 },
          { field: "depth_to", old: 30, new: null },
          { field: "water_type", old: "salt", new: "fresh" },
          { field: "altitude", old: null, new: 1000 },
          { field: "entry_types", old: ["shore"], new: ["shore", "boat"] },
          {
            field: "external_ids",
            old: [],
            new: [{ registry: "wikidata", identifier: "Q1" }],
          },
        ],
      }),
    ]);
    render(<SiteHistoryCard siteUuid="site-1" asReviewer={false} />);

    const text = (await card()).textContent;
    expect(text).toContain("NameKapal Polis → Kapal Polisi");
    expect(text).toContain("Other namesNot recorded → KP, Police Wreck");
    expect(text).toContain("LocationNot recorded → Tulamben");
    expect(text).toMatch(/Depth from16 ft → 20 ft/);
    expect(text).toMatch(/Depth to98 ft → Not recorded/);
    expect(text).toContain("Water typeSalt water → Fresh water");
    expect(text).toMatch(/AltitudeNot recorded → 3,?281 ft/);
    expect(text).toMatch(/Entry types.*Shore → Shore, Boat/);
    expect(text).toContain("RegistriesNot recorded → Wikidata Q1");
  });

  it("says how far a pin moved, on one line", async () => {
    answer([
      entry({
        details: [
          { field: "latitude", old: 27.1, new: 27.101 },
          { field: "longitude", old: 34.5, new: 34.5 },
        ],
      }),
    ]);
    render(<SiteHistoryCard siteUuid="site-1" asReviewer={false} />);

    await card();
    const lines = screen.getAllByRole("definition");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent("Moved 111 m");
    expect(screen.queryByText(/Latitude|Longitude/)).not.toBeInTheDocument();
  });

  it("shows a field it does not know under its own name, with the raw values", async () => {
    answer([
      entry({
        details: [{ field: "visibility", old: { metres: 10 }, new: "good" }],
      }),
    ]);
    render(<SiteHistoryCard siteUuid="site-1" asReviewer={false} />);

    expect((await card()).textContent).toContain(
      'visibility{"metres":10} → good',
    );
  });

  it("draws nothing for a record with no entry", async () => {
    answer([]);
    const { container } = render(
      <SiteHistoryCard siteUuid="site-1" asReviewer={false} />,
    );

    await waitFor(() => expect(getHistory).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing when the read fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    getHistory.mockRejectedValue(new Error("down"));
    const { container } = render(
      <SiteHistoryCard siteUuid="site-1" asReviewer={false} />,
    );

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    error.mockRestore();
  });

  it("shows no reviewer's lines to anyone but a reviewer", async () => {
    answer([entry({ made_by: "Ada Diver" })]);
    render(<SiteHistoryCard siteUuid="site-1" asReviewer={false} />);

    const text = (await card()).textContent;
    expect(text).not.toMatch(/Reviewed by|shown to other divers|Accepted as/);
  });

  it("reads the admin history for a reviewer, with who proposed and who reviewed", async () => {
    getAdminHistory.mockResolvedValue(
      page([
        adminEntry({
          uuid: "correction",
          made_by: "Rita Reviewer",
          show_proposer: null,
          reviewed_by: null,
          corrected: null,
        }),
        adminEntry({
          uuid: "divers",
          made_by: "Ada Diver",
          show_proposer: false,
          corrected: true,
        }),
      ]),
    );
    render(<SiteHistoryCard siteUuid="site-1" asReviewer />);

    const items = await entries();
    expect(getAdminHistory).toHaveBeenCalledWith("site-1", 1, 100);
    expect(getHistory).not.toHaveBeenCalled();
    // A correction carries none of the reviewer's lines.
    expect(items[0]).toHaveTextContent(/^Changed by Rita Reviewer · /);
    expect(items[0]).not.toHaveTextContent(/Reviewed by|Accepted as/);
    expect(items[1]).toHaveTextContent("Changed by Ada Diver");
    expect(items[1]).toHaveTextContent(
      "Their name is not shown to other divers.",
    );
    expect(items[1]).toHaveTextContent("Reviewed by Rita Reviewer.");
    expect(items[1]).toHaveTextContent("The review corrected it");
  });

  it("keys a diver's entry on corrected, whichever names are gone", async () => {
    getAdminHistory.mockResolvedValue(
      page([
        adminEntry({
          made_by: null,
          show_proposer: null,
          reviewed_by: null,
          corrected: false,
        }),
      ]),
    );
    render(<SiteHistoryCard siteUuid="site-1" asReviewer />);

    const text = (await card()).textContent;
    expect(text).toContain("The proposal has gone with its account.");
    expect(text).toContain("Reviewed by an account since deleted.");
    expect(text).toContain("Accepted as proposed.");
  });
});
