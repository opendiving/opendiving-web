import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SitesPageContent } from "./sites-page-content";
import type { DiveSite } from "@/lib/api/dive-sites";

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
vi.mock("@/components/sites/dive-site-card", () => ({
  DiveSiteCard: ({ site, onEdit }: { site: DiveSite; onEdit: () => void }) => (
    <li>
      {site.name}
      <button onClick={onEdit}>Edit {site.name}</button>
    </li>
  ),
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
      <>
        <button onClick={() => onSaved(diveSite, false)}>Save private</button>
        <button onClick={() => onSaved(diveSite, true)}>Save public</button>
      </>
    ) : null,
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
  DeleteWithReassignDialog: () => null,
}));
vi.mock("@/lib/api/dive-sites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-sites")>()),
  diveSitesAPI: { getDiveSites: vi.fn(), deleteDiveSite: vi.fn() },
}));

const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const getDiveSites = vi.mocked(diveSitesAPI.getDiveSites);

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
});

describe("SitesPageContent", () => {
  it("says nothing of the Commons where no site of the diver's is in it", async () => {
    answerWith([]);
    render(<SitesPageContent />);

    expect(await screen.findByText("Own site")).toBeInTheDocument();
    expect(screen.queryByText(/OpenDiving Commons/)).not.toBeInTheDocument();
  });

  it("says how many of the diver's sites are in the Commons, and lists them", async () => {
    answerWith([site("Copy one"), site("Copy two")]);
    render(<SitesPageContent />);

    expect(
      await screen.findByText(/2 of your sites are in OpenDiving Commons/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show them" }));

    await waitFor(() =>
      expect(screen.queryByText("Own site")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Copy one")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Show all sites" }),
    );
    expect(await screen.findByText("Own site")).toBeInTheDocument();
  });

  it("opens the flow from a save with Public chosen, and re-reads the rows after a replace", async () => {
    answerWith([]);
    render(<SitesPageContent />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit Own site" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save private" }));
    expect(screen.queryByText("Proposing Own site")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save public" }));
    expect(await screen.findByText("Proposing Own site")).toBeInTheDocument();

    const reads = getDiveSites.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() =>
      expect(getDiveSites.mock.calls.length).toBeGreaterThan(reads),
    );
  });

  it("reaches the diver's proposals only where the Commons is edited", async () => {
    answerWith([]);
    const { unmount } = render(<SitesPageContent />);
    await screen.findByText("Own site");
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
