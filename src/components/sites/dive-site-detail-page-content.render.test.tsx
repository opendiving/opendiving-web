import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveSiteDetailPageContent } from "./dive-site-detail-page-content";
import { ProposeOnArrivalContext } from "@/contexts/ProposeOnArrivalContext";
import type { DiveSite } from "@/lib/api/dive-sites";

// The page's own decisions, about a site's owner and whether it is saved; what
// sits around them has tests of its own.
const loaded = vi.hoisted(() => ({
  site: null as unknown,
  primary: false,
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: loaded.replace }),
}));
vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({
    user: { uuid: "user-1" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));
vi.mock("@/hooks/useResource", () => ({
  useResource: () => ({
    resource: loaded.site,
    setResource: vi.fn(),
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useInstanceConfig", () => ({
  useInstanceConfig: () => ({
    config: { commons_primary: loaded.primary },
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useReturnTo", () => ({
  useReturnTo: () => ({ href: "/sites", label: "Back to dive sites" }),
  useWithReturnTo: () => (href: string) => href,
}));
vi.mock("@/components/sites/dive-site-hero", () => ({
  DiveSiteHero: ({ actions }: { actions: React.ReactNode }) => (
    <div>{actions}</div>
  ),
}));
vi.mock("@/components/dives/recent-dives-card", () => ({
  RecentDivesCard: () => null,
}));
vi.mock("@/components/sites/dive-site-species-card", () => ({
  DiveSiteSpeciesCard: () => null,
}));
vi.mock("@/components/sites/dive-site-dialog", () => ({
  DiveSiteDialog: ({
    open,
    diveSite,
    onSaved,
  }: {
    open: boolean;
    diveSite: DiveSite;
    onSaved: (site: DiveSite, proposes: boolean) => void;
  }) =>
    open ? (
      <div>
        The whole form
        <button onClick={() => onSaved(diveSite, false)}>Save private</button>
        <button onClick={() => onSaved(diveSite, true)}>Save public</button>
      </div>
    ) : null,
  readBack: vi.fn(),
}));
vi.mock("@/components/sites/propose-site-dialog", () => ({
  ProposeSiteDialog: ({ open }: { open: boolean }) =>
    open ? <div>Is it already in the Commons?</div> : null,
}));
vi.mock("@/components/sites/propose-change-dialog", () => ({
  ProposeChangeDialog: ({ open }: { open: boolean }) =>
    open ? <div>The shared members</div> : null,
}));
vi.mock("@/components/sites/commons-site-dialog", () => ({
  CommonsSiteDialog: ({ open, site }: { open: boolean; site: DiveSite }) =>
    open ? <div>Notes and tags of {site.name}</div> : null,
}));

const COMMONS: DiveSite = {
  uuid: "commons-1",
  name: "Kapal Polis",
  owner: "opendivingcommons",
  saved: false,
  attribution:
    "[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)",
  created_at: "2026-01-01T00:00:00Z",
};
const OWN: DiveSite = {
  uuid: "site-1",
  name: "House reef",
  owner: "account",
  saved: true,
  attribution: null,
  created_at: "2026-01-01T00:00:00Z",
};

const openMenu = () =>
  userEvent.click(screen.getByRole("button", { name: "More actions" }));
const items = async () => {
  await screen.findAllByRole("menuitem");
  return screen.getAllByRole("menuitem").map((item) => item.textContent);
};

beforeEach(() => {
  loaded.site = null;
  loaded.primary = false;
});

describe("DiveSiteDetailPageContent", () => {
  it("offers an unsaved Commons record saving, and neither edit nor remove", async () => {
    loaded.site = COMMONS;
    render(<DiveSiteDetailPageContent />);

    await openMenu();

    expect(await items()).toEqual(["Save to your sites"]);
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Save to your sites" }),
    );
    expect(
      await screen.findByText("Notes and tags of Kapal Polis"),
    ).toBeInTheDocument();
  });

  it("offers a saved Commons record its notes and tags, and leaving the list", async () => {
    loaded.site = { ...COMMONS, saved: true };
    render(<DiveSiteDetailPageContent />);

    await openMenu();

    expect(await items()).toEqual([
      "Edit notes and tags",
      "Remove from your sites",
    ]);
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Edit notes and tags" }),
    );
    expect(
      await screen.findByText("Notes and tags of Kapal Polis"),
    ).toBeInTheDocument();
  });

  it("states what removing does, through the delete dialog", async () => {
    loaded.site = { ...COMMONS, saved: true };
    render(<DiveSiteDetailPageContent />);

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove from your sites" }),
    );

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "the site stays in OpenDiving Commons",
    );
  });

  it("carries the credit on a Commons record's page", () => {
    loaded.site = COMMONS;
    render(<DiveSiteDetailPageContent />);

    expect(
      screen.getByRole("link", {
        name: "Data © OpenStreetMap contributors, ODbL 1.0.",
      }),
    ).toHaveAttribute("href", "https://osm.org/copyright");
  });

  it("leaves a diver's own site as it was", async () => {
    loaded.site = OWN;
    render(<DiveSiteDetailPageContent />);

    await openMenu();

    expect(await items()).toEqual(["Edit", "Delete"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(await screen.findByText("The whole form")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /OpenStreetMap/ }),
    ).not.toBeInTheDocument();
  });

  it("offers proposing a diver's own site only where the Commons is edited", async () => {
    loaded.site = OWN;
    loaded.primary = true;
    render(<DiveSiteDetailPageContent />);

    await openMenu();

    expect(await items()).toEqual([
      "Propose for OpenDiving Commons",
      "Edit",
      "Delete",
    ]);
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Propose for OpenDiving Commons" }),
    );
    expect(
      await screen.findByText("Is it already in the Commons?"),
    ).toBeInTheDocument();
  });

  it("opens the flow from a save with Public chosen, and from no other save", async () => {
    loaded.site = OWN;
    loaded.primary = true;
    render(<DiveSiteDetailPageContent />);

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Edit" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save private" }));
    expect(
      screen.queryByText("Is it already in the Commons?"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save public" }));
    expect(
      await screen.findByText("Is it already in the Commons?"),
    ).toBeInTheDocument();
  });

  it("opens the flow on arrival when the header's form asked for it", async () => {
    loaded.site = OWN;
    loaded.primary = true;
    const proposeOnArrival = vi.fn((uuid: string) => uuid === OWN.uuid);
    render(
      <ProposeOnArrivalContext.Provider value={proposeOnArrival}>
        <DiveSiteDetailPageContent />
      </ProposeOnArrivalContext.Provider>,
    );

    expect(
      await screen.findByText("Is it already in the Commons?"),
    ).toBeInTheDocument();
  });

  it("opens no flow on an arrival nobody asked for", () => {
    loaded.site = OWN;
    loaded.primary = true;
    render(<DiveSiteDetailPageContent />);

    expect(
      screen.queryByText("Is it already in the Commons?"),
    ).not.toBeInTheDocument();
  });

  it("offers a change to any Commons record where the Commons is edited", async () => {
    loaded.site = COMMONS;
    loaded.primary = true;
    render(<DiveSiteDetailPageContent />);

    await openMenu();

    expect(await items()).toEqual(["Propose a change", "Save to your sites"]);
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Propose a change" }),
    );
    expect(await screen.findByText("The shared members")).toBeInTheDocument();
  });

  it("shows a waiting proposal and offers no second one", async () => {
    loaded.site = {
      ...OWN,
      proposal: {
        uuid: "proposal-1",
        kind: "new_site",
        status: "waiting",
        reason: null,
        created_at: "2026-01-02T00:00:00Z",
      },
    };
    loaded.primary = true;
    render(<DiveSiteDetailPageContent />);

    expect(screen.getByText("Waiting for review")).toBeInTheDocument();
    await openMenu();
    expect(await items()).toEqual(["Edit", "Delete"]);
  });

  it("offers proposing again after a decline, and shows why", async () => {
    loaded.site = {
      ...OWN,
      proposal: {
        uuid: "proposal-1",
        kind: "new_site",
        status: "declined",
        reason: "Pin is on land",
        created_at: "2026-01-02T00:00:00Z",
      },
    };
    loaded.primary = true;
    render(<DiveSiteDetailPageContent />);

    expect(screen.getByText("Pin is on land")).toBeInTheDocument();
    await openMenu();
    expect(await items()).toContain("Propose for OpenDiving Commons");
  });

  it("offers replacing a copy on every instance, and goes to the record", async () => {
    loaded.site = {
      ...OWN,
      commons_match: { uuid: "commons-1", name: "Kapal Polis" },
    };
    render(<DiveSiteDetailPageContent />);

    expect(screen.getByRole("link", { name: "Kapal Polis" })).toHaveAttribute(
      "href",
      "/sites/commons-1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Replace with Commons site" }),
    );
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "is then deleted",
    );
  });
});
