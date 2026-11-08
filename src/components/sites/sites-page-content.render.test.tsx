import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SitesPageContent } from "./sites-page-content";
import type { DiveSite, DiveSiteSearchItem } from "@/lib/api/dive-sites";

const instance = vi.hoisted(() => ({ primary: false }));

vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({
    user: { uuid: "user-1" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useInstanceConfig", () => ({
  useInstanceConfig: () => ({
    config: { commons_primary: instance.primary },
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useTags", () => ({ useTags: () => ({ tags: [] }) }));
vi.mock("@/components/layout/quick-create", () => ({
  useQuickCreate: () => vi.fn(),
}));
const finder = vi.hoisted(() => ({
  props: null as null | import("./finder/site-finder").SiteFinderProps,
  reload: vi.fn(),
  removeSite: vi.fn(),
}));
vi.mock("@/components/sites/finder/site-finder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./finder/site-finder")>();
  const { useImperativeHandle } = await import("react");
  return {
    ...actual,
    SiteFinder: (props: import("./finder/site-finder").SiteFinderProps) => {
      finder.props = props;
      useImperativeHandle(props.handleRef, () => ({
        reload: finder.reload,
        removeSite: finder.removeSite,
      }));
      return (
        <div>
          <p>
            {props.filters.yours ? "Yours" : "Everything"}
            {props.filters.commonsMatch ? ", matches" : ""}
          </p>
          <ul>
            <li>
              Own site
              {props.siteMenu?.(ROW)}
            </li>
          </ul>
          <button
            onClick={() =>
              props.onAddSite?.({ latitude: 28.5, longitude: 34.5 })
            }
          >
            Add here
          </button>
        </div>
      );
    },
  };
});
vi.mock("@/hooks/useSitesFinderOpening", () => ({
  useSitesFinderOpening: () => null,
}));
vi.mock("@/components/sites/dive-site-dialog", () => ({
  DiveSiteDialog: ({
    open,
    diveSite,
    pin,
    onSaved,
  }: {
    open: boolean;
    diveSite?: DiveSite | null;
    pin?: { latitude: number; longitude: number } | null;
    onSaved: (site: DiveSite, proposes: boolean) => void;
  }) => {
    if (!open) return null;
    const saved = diveSite ?? site("New site");
    return (
      <>
        {pin && (
          <p>
            Pinned at {pin.latitude}, {pin.longitude}
          </p>
        )}
        <button onClick={() => onSaved(saved, false)}>Save private</button>
        <button onClick={() => onSaved(saved, true)}>Save public</button>
      </>
    );
  },
}));
vi.mock("@/components/sites/site-proposal-flow", () => ({
  SiteProposalFlow: ({
    site,
    onReplaced,
  }: {
    site: DiveSite | null;
    onReplaced: (record: DiveSite) => void;
  }) =>
    site && (
      <>
        <p>Proposing {site.name}</p>
        <button onClick={() => onReplaced(site)}>Replace</button>
      </>
    ),
}));
vi.mock("@/components/sites/commons-site-dialog", () => ({
  CommonsSiteDialog: () => null,
}));
vi.mock("@/components/dives/delete-with-reassign-dialog", () => ({
  DeleteWithReassignDialog: ({
    targetId,
    onConfirm,
  }: {
    targetId: string | null;
    onConfirm: (moveDivesTo?: string, name?: string) => void;
  }) =>
    targetId ? (
      <button onClick={() => onConfirm()}>Confirm delete</button>
    ) : null,
}));
vi.mock("@/lib/api/dive-sites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-sites")>()),
  diveSitesAPI: {
    getDiveSites: vi.fn(),
    getDiveSite: vi.fn(),
    deleteDiveSite: vi.fn(),
  },
}));

const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const getDiveSites = vi.mocked(diveSitesAPI.getDiveSites);
const getDiveSite = vi.mocked(diveSitesAPI.getDiveSite);

const ROW: DiveSiteSearchItem = {
  kind: "site",
  uuid: "Own site",
  name: "Own site",
  owner: "account",
  saved: true,
  attribution: null,
  distance_m: null,
  match: null,
  dives: null,
  proposal: null,
};

const site = (name: string): DiveSite => ({
  uuid: name,
  name,
  owner: "account",
  saved: true,
  attribution: null,
  created_at: "2026-01-01T00:00:00Z",
});

const answerWith = (matches: DiveSite[]) =>
  getDiveSites.mockImplementation(async (page, perPage, filters) => {
    const data = filters?.commonsMatch
      ? matches
      : [...matches, site("Own site")];
    return {
      data,
      total_count: data.length,
      has_more: false,
      page: page ?? 1,
      items_per_page: perPage ?? 10,
    };
  });

beforeEach(() => {
  instance.primary = false;
  getDiveSites.mockReset();
  getDiveSite.mockReset();
  finder.reload.mockReset();
  finder.removeSite.mockReset();
});

describe("SitesPageContent", () => {
  it("says nothing of the Commons where no site of the diver's is in it", async () => {
    answerWith([]);
    render(<SitesPageContent />);

    expect(await screen.findByText("Everything")).toBeInTheDocument();
    await waitFor(() => expect(getDiveSites).toHaveBeenCalled());
    expect(screen.queryByText(/OpenDiving Commons/)).not.toBeInTheDocument();
  });

  it("lists the diver's sites that are in the Commons under Your sites, and back", async () => {
    answerWith([site("Copy one"), site("Copy two")]);
    render(<SitesPageContent />);

    expect(
      await screen.findByText(/2 of your sites are in OpenDiving Commons/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show them" }));
    expect(screen.getByText("Yours, matches")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Show all sites" }),
    );
    expect(screen.getByText("Yours")).toBeInTheDocument();
  });

  it("drops the match filter with the last match, as the notice goes", async () => {
    answerWith([site("Copy one")]);
    render(<SitesPageContent />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Show it" }),
    );
    expect(screen.getByText("Yours, matches")).toBeInTheDocument();

    answerWith([]);
    vi.mocked(diveSitesAPI.deleteDiveSite).mockResolvedValue({ message: "ok" });
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Own site" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Delete" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Confirm delete" }),
    );

    await waitFor(() => expect(screen.getByText("Yours")).toBeInTheDocument());
    expect(
      screen.queryByText(/of your sites (is|are) in OpenDiving Commons/),
    ).toBeNull();
  });

  it("edits a row from the record read by uuid, and opens the flow from a save with Public chosen", async () => {
    answerWith([]);
    getDiveSite.mockResolvedValue(site("Own site"));
    render(<SitesPageContent />);

    const editFromMenu = async () => {
      await userEvent.click(
        await screen.findByRole("button", { name: "Actions for Own site" }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Edit" }),
      );
    };

    await editFromMenu();
    expect(getDiveSite).toHaveBeenCalledWith("Own site");
    await userEvent.click(
      await screen.findByRole("button", { name: "Save private" }),
    );
    expect(finder.reload).toHaveBeenCalled();
    expect(screen.queryByText("Proposing Own site")).not.toBeInTheDocument();

    await editFromMenu();
    await userEvent.click(
      await screen.findByRole("button", { name: "Save public" }),
    );
    expect(await screen.findByText("Proposing Own site")).toBeInTheDocument();

    finder.reload.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(finder.reload).toHaveBeenCalled();
  });

  it("opens the site form on the map's pin, and proposes a site saved as Public", async () => {
    answerWith([]);
    render(<SitesPageContent />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Add here" }),
    );
    expect(screen.getByText("Pinned at 28.5, 34.5")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save public" }));
    expect(finder.reload).toHaveBeenCalled();
    expect(await screen.findByText("Proposing New site")).toBeInTheDocument();
  });

  it("links each row to its page", async () => {
    answerWith([]);
    render(<SitesPageContent />);
    await screen.findByText("Everything");

    expect(finder.props?.siteHref?.("site-1")).toBe("/sites/site-1");
  });

  it("reaches the diver's proposals only where the Commons is edited", async () => {
    answerWith([]);
    const { unmount } = render(<SitesPageContent />);
    await screen.findByText("Everything");
    expect(
      screen.queryByRole("link", { name: "Your proposals" }),
    ).not.toBeInTheDocument();
    unmount();

    instance.primary = true;
    render(<SitesPageContent />);
    expect(
      await screen.findByRole("link", { name: "Your proposals" }),
    ).toHaveAttribute("href", "/sites/proposals");
  });
});
