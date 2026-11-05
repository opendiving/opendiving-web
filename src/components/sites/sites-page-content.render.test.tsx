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
  DiveSiteCard: ({ site }: { site: DiveSite }) => <li>{site.name}</li>,
}));
vi.mock("@/components/sites/dive-site-dialog", () => ({
  DiveSiteDialog: () => null,
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
