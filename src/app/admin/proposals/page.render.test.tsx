import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import AdminProposalsPage from "./page";
import { adminAPI, type AdminDiveSiteProposal } from "@/lib/api/admin";
import {
  diveSitesAPI,
  type DiveSite,
  type DiveSiteLookupItem,
  type DiveSiteSharedMembers,
} from "@/lib/api/dive-sites";
import { useInstanceConfig } from "@/hooks/useInstanceConfig";

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

vi.mock("@/hooks/useInstanceConfig", () => ({ useInstanceConfig: vi.fn() }));

// The real map is the browser lane's (`proposal-map.browser.test.tsx`).
vi.mock("@/components/admin/proposal-map-lazy", () => ({
  ProposalMap: ({ markers }: { markers: { label: string }[] }) => (
    <ul aria-label="map">
      {markers.map((marker) => (
        <li key={marker.label}>{marker.label}</li>
      ))}
    </ul>
  ),
}));

vi.mock("@/lib/api/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/admin")>()),
  adminAPI: {
    getDiveSiteProposals: vi.fn(),
    acceptDiveSiteProposal: vi.fn(),
    declineDiveSiteProposal: vi.fn(),
  },
}));

vi.mock("@/lib/api/dive-sites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-sites")>()),
  diveSitesAPI: { getDiveSite: vi.fn(), lookupDiveSites: vi.fn() },
}));

const getProposals = vi.mocked(adminAPI.getDiveSiteProposals);
const accept = vi.mocked(adminAPI.acceptDiveSiteProposal);
const decline = vi.mocked(adminAPI.declineDiveSiteProposal);
const getDiveSite = vi.mocked(diveSitesAPI.getDiveSite);
const lookupDiveSites = vi.mocked(diveSitesAPI.lookupDiveSites);

const OSM_CREDIT =
  "[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)";

const MEMBERS: DiveSiteSharedMembers = {
  name: "Coral Garden",
  other_names: ["The Garden"],
  latitude: 27.5,
  longitude: 34.25,
  location_name: "Dahab",
  external_ids: [{ registry: "wikidata", identifier: "Q42" }],
  depth_from: 5,
  depth_to: 30,
  water_type: "salt",
  altitude: null,
  entry_types: ["shore"],
};

const MATCH: AdminDiveSiteProposal["matches"][number] = {
  uuid: "record-1",
  name: "Coral Gardens",
  other_names: [],
  latitude: 27.5001,
  longitude: 34.2501,
  location_name: "Dahab",
  external_ids: [],
  attribution: OSM_CREDIT,
  rule: "similar_name_within_200_m",
  distance_metres: 15,
  qualifier_siblings: false,
};

const NEW_SITE: AdminDiveSiteProposal = {
  uuid: "proposal-1",
  kind: "new_site",
  message: "Dived it twice",
  created_at: "2026-11-01T10:00:00Z",
  proposer: { name: "Sam", accepted_count: 2, declined_count: 1 },
  site_uuid: "site-1",
  current: MEMBERS,
  proposed: MEMBERS,
  changed: Object.keys(MEMBERS),
  matches: [MATCH, { ...MATCH, uuid: "record-2", name: "Coral Corner" }],
};

const CHANGE: AdminDiveSiteProposal = {
  ...NEW_SITE,
  uuid: "proposal-2",
  kind: "change",
  site_uuid: "record-9",
  current: { ...MEMBERS, name: "Coral North" },
  proposed: { ...MEMBERS, name: "Coral Gardens North", latitude: 27.51 },
  changed: ["name", "latitude", "longitude"],
  matches: [],
};

const page = (data: AdminDiveSiteProposal[]) => ({
  data,
  total_count: data.length,
  has_more: false,
  page: 1,
  items_per_page: 10,
});

const refused = (status: number, detail: string) =>
  new AxiosError("refused", undefined, undefined, undefined, {
    status,
    statusText: "",
    data: { detail },
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

const primary = (commons_primary: boolean) =>
  vi.mocked(useInstanceConfig).mockReturnValue({
    config: {
      registration_mode: "invite",
      project_operated: true,
      join_links: false,
      map_tiles: false,
      dive_conditions: false,
      commons_primary,
    },
    isLoading: false,
  });

const openProposal = async (name: string) => {
  render(<AdminProposalsPage />);
  await userEvent.click(await screen.findByRole("button", { name }));
};

const acceptButton = () => screen.getByRole("button", { name: "Accept" });

beforeEach(() => {
  vi.clearAllMocks();
  primary(true);
  getProposals.mockResolvedValue(page([NEW_SITE, CHANGE]));
  accept.mockResolvedValue();
  decline.mockResolvedValue();
});

describe("the review queue", () => {
  it("is not there, and asks for nothing, on a copy that does not edit the Commons", async () => {
    primary(false);
    render(<AdminProposalsPage />);

    expect(await screen.findByText("Page not found.")).toBeInTheDocument();
    expect(getProposals).not.toHaveBeenCalled();
  });

  it("reads as absent when the config could not be read", () => {
    vi.mocked(useInstanceConfig).mockReturnValue({
      config: null,
      isLoading: false,
    });
    render(<AdminProposalsPage />);

    expect(screen.getByText("Page not found.")).toBeInTheDocument();
    expect(getProposals).not.toHaveBeenCalled();
  });

  it("lists each proposal's site, kind and proposer in the API's order", async () => {
    render(<AdminProposalsPage />);

    await screen.findByRole("button", { name: "Coral Garden" });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^Coral GardenNew siteSam/),
      expect.stringMatching(/^Coral NorthChangeSam/),
    ]);
  });
});

describe("a new site", () => {
  it("shows the pin, each match with its rule and distance, and one credit for the two", async () => {
    await openProposal("Coral Garden");

    const map = screen.getByRole("list", { name: "map" });
    expect(within(map).getByText("Proposed")).toBeInTheDocument();
    expect(within(map).getByText("Coral Gardens · 15 m")).toBeInTheDocument();
    expect(within(map).getByText("Coral Corner · 15 m")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open the pin on OpenStreetMap/ }),
    ).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/?mlat=27.5&mlon=34.25#map=17/27.5/34.25",
    );

    expect(screen.getAllByText(/A similar name within 200 m/)).toHaveLength(2);
    expect(
      screen.getAllByRole("link", { name: /OpenStreetMap contributors/ }),
    ).toHaveLength(1);
    expect(screen.getByText("Dived it twice")).toBeInTheDocument();
    expect(screen.getByText(/2 proposals accepted, 1 declined/)).toBeVisible();
  });

  it("sends the whole record as the reviewer left it, and leaves the queue", async () => {
    await openProposal("Coral Garden");
    await userEvent.click(acceptButton());

    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Coral Reef");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Accept" }),
    );

    await waitFor(() =>
      expect(accept).toHaveBeenCalledWith("proposal-1", {
        members: { ...MEMBERS, name: "Coral Reef" },
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Coral North" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Coral Garden" })).toBeNull();
    expect(getProposals).toHaveBeenCalledTimes(1);
  });

  it("keeps the form open on the record rule the API names", async () => {
    accept.mockRejectedValue(refused(422, "A pin cannot be at 0, 0"));
    await openProposal("Coral Garden");
    await userEvent.click(acceptButton());

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Accept" }),
    );

    expect(
      await within(dialog).findByText("A pin cannot be at 0, 0"),
    ).toBeInTheDocument();
  });

  it("folds into a match with no members, leaving the record as it stands", async () => {
    await openProposal("Coral Garden");
    await userEvent.click(
      screen.getAllByRole("button", { name: "Accept into" })[0],
    );

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Accept" }),
    );

    await waitFor(() =>
      expect(accept).toHaveBeenCalledWith("proposal-1", { into: "record-1" }),
    );
    expect(getDiveSite).not.toHaveBeenCalled();
  });

  it("starts a change to the record from the record's own read, never the proposal", async () => {
    getDiveSite.mockResolvedValue({
      uuid: "record-1",
      name: "Coral Gardens",
      other_names: [],
      latitude: 27.5001,
      longitude: 34.2501,
      location: { name: "Dahab, Egypt", latitude: 28.5, longitude: 34.5 },
      external_ids: [],
      depth_from: 8,
      depth_to: 18,
      water_type: "salt",
      altitude: 0,
      entry_types: ["boat"],
      tags: ["mine"],
      notes: "mine too",
      owner: "opendivingcommons",
      saved: true,
      attribution: OSM_CREDIT,
      created_at: "2026-01-01T00:00:00Z",
    } satisfies DiveSite);
    await openProposal("Coral Garden");
    await userEvent.click(
      screen.getAllByRole("button", { name: "Accept into" })[0],
    );

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Change the record too" }),
    );
    await userEvent.click(
      await within(dialog).findByRole("button", {
        name: "Accept with these changes",
      }),
    );

    await waitFor(() =>
      expect(accept).toHaveBeenCalledWith("proposal-1", {
        into: "record-1",
        members: {
          name: "Coral Gardens",
          other_names: [],
          latitude: 27.5001,
          longitude: 34.2501,
          location_name: "Dahab, Egypt",
          external_ids: [],
          depth_from: 8,
          depth_to: 18,
          water_type: "salt",
          altitude: 0,
          entry_types: ["boat"],
        },
      }),
    );
    expect(getDiveSite).toHaveBeenCalledWith("record-1");
  });

  it("finds a record by search, keeping only Commons rows of the plain lookup", async () => {
    const row = (
      uuid: string,
      name: string,
      owner: DiveSiteLookupItem["owner"],
    ): DiveSiteLookupItem => ({
      uuid,
      name,
      owner,
      saved: true,
      attribution: owner === "account" ? null : OSM_CREDIT,
    });
    lookupDiveSites.mockResolvedValue({
      data: [
        row("own-1", "Canyon, my own", "account"),
        row("record-7", "Canyon", "opendivingcommons"),
      ],
      total_count: 2,
      has_more: false,
      page: 1,
      items_per_page: 25,
    });
    await openProposal("Coral Garden");

    await userEvent.type(screen.getByRole("combobox"), "Can");
    await userEvent.click(
      await screen.findByRole("option", { name: /^Canyon/ }),
    );
    expect(screen.queryByRole("option", { name: /my own/ })).toBeNull();
    expect(lookupDiveSites).toHaveBeenCalledWith(1, 25, { search: "Can" });

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Accept" }),
    );
    await waitFor(() =>
      expect(accept).toHaveBeenCalledWith("proposal-1", { into: "record-7" }),
    );
  });
});

describe("the search for a record", () => {
  it("opens nothing on a name typed out on the way to a longer one", async () => {
    lookupDiveSites.mockResolvedValue({
      data: [
        {
          uuid: "record-7",
          name: "Canyon",
          owner: "opendivingcommons",
          saved: false,
          attribution: OSM_CREDIT,
        },
      ],
      total_count: 1,
      has_more: false,
      page: 1,
      items_per_page: 25,
    });
    await openProposal("Coral Garden");

    const search = screen.getByRole("combobox");
    await userEvent.type(search, "Canyo");
    await screen.findByRole("option", { name: /^Canyon/ });
    await userEvent.type(search, "n");
    await userEvent.tab();

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("a change", () => {
  it("shows the record against the change, and how far the pin moves", async () => {
    await openProposal("Coral North");

    expect(screen.getByRole("columnheader", { name: "Current" })).toBeVisible();
    const nameRow = screen.getByRole("row", { name: /^Name/ });
    expect(nameRow).toHaveTextContent("Coral Gardens North (changed)");
    expect(screen.getByText(/^The pin moves 1\.1 km\.$/)).toBeInTheDocument();
    const map = screen.getByRole("list", { name: "map" });
    expect(within(map).getByText("Current")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("declining", () => {
  it("needs a reason, and leaves the queue once sent", async () => {
    await openProposal("Coral Garden");
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));

    const dialog = await screen.findByRole("dialog");
    const send = within(dialog).getByRole("button", { name: "Decline" });
    expect(send).toBeDisabled();

    await userEvent.type(
      within(dialog).getByLabelText("Reason"),
      "  Already in the Commons ",
    );
    await userEvent.click(send);

    await waitFor(() =>
      expect(decline).toHaveBeenCalledWith(
        "proposal-1",
        "Already in the Commons",
      ),
    );
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
  });
});

describe("a proposal no longer waiting", () => {
  it("says so and reads the queue again", async () => {
    decline.mockRejectedValue(refused(409, "Already decided"));
    await openProposal("Coral Garden");
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Reason"), "No");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Decline" }),
    );

    await waitFor(() => expect(getProposals).toHaveBeenCalledTimes(2));
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Already decided",
        variant: "destructive",
      }),
    );
  });
});
