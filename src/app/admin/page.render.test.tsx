import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminPage from "./page";
import { adminAPI } from "@/lib/api/admin";
import { useInstanceConfig } from "@/hooks/useInstanceConfig";

vi.mock("@/hooks/useInstanceConfig", () => ({ useInstanceConfig: vi.fn() }));

vi.mock("@/lib/api/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/admin")>()),
  adminAPI: {
    getDiveSiteProposals: vi.fn(),
    countSpeciesWithPhotoProposals: vi.fn(),
  },
}));

const getProposals = vi.mocked(adminAPI.getDiveSiteProposals);
const countProposed = vi.mocked(adminAPI.countSpeciesWithPhotoProposals);

const primary = (commons_primary: boolean) =>
  vi.mocked(useInstanceConfig).mockReturnValue({
    config: {
      registration_mode: "invite",
      project_operated: false,
      join_links: false,
      map_tiles: false,
      dive_conditions: false,
      commons_primary,
      mcp_enabled: false,
    },
    isLoading: false,
  });

beforeEach(() => {
  vi.clearAllMocks();
  countProposed.mockResolvedValue(0);
  primary(false);
});

describe("the admin section's landing", () => {
  it("offers every screen in the section", () => {
    render(<AdminPage />);

    expect(screen.getByRole("link", { name: /Invite Queue/ })).toHaveAttribute(
      "href",
      "/admin/invites",
    );
    expect(screen.getByRole("link", { name: /Stats/ })).toHaveAttribute(
      "href",
      "/admin/stats",
    );
    expect(screen.getByRole("link", { name: /Species/ })).toHaveAttribute(
      "href",
      "/admin/species",
    );
  });

  it("says on the species card how many species have a photo proposal waiting", async () => {
    countProposed.mockResolvedValue(2);
    render(<AdminPage />);

    expect(
      await screen.findByRole("link", {
        name: /2 species with a photo proposal waiting/,
      }),
    ).toHaveAttribute("href", "/admin/species");
  });

  it("offers the proposals, with how many wait, where the Commons is edited", async () => {
    primary(true);
    getProposals.mockResolvedValue({
      data: [],
      total_count: 3,
      has_more: true,
      page: 1,
      items_per_page: 1,
    });
    render(<AdminPage />);

    expect(
      await screen.findByRole("link", { name: /3 proposals waiting/ }),
    ).toHaveAttribute("href", "/admin/proposals");
    expect(getProposals).toHaveBeenCalledWith(1, 1);
  });

  it("does not, and asks nothing, on any other copy", () => {
    render(<AdminPage />);

    expect(screen.queryByRole("link", { name: /Proposals/ })).toBeNull();
    expect(getProposals).not.toHaveBeenCalled();
  });
});
