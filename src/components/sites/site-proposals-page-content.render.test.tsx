import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SiteProposalsPageContent } from "./site-proposals-page-content";
import type { DiveSiteProposal } from "@/lib/api/dive-sites";

const instance = vi.hoisted(() => ({
  state: {
    config: { commons_primary: true } as object | null,
    isLoading: false,
  },
}));

vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({
    user: { uuid: "user-1" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/hooks/useInstanceConfig", () => ({
  useInstanceConfig: () => instance.state,
}));
vi.mock("@/hooks/useReturnTo", () => ({
  useWithReturnTo: () => (href: string) => href,
}));
vi.mock("@/lib/api/dive-sites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-sites")>()),
  diveSitesAPI: {
    getDiveSiteProposals: vi.fn(),
    withdrawDiveSiteProposal: vi.fn(),
    updateDiveSiteProposal: vi.fn(),
  },
}));

const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const getProposals = vi.mocked(diveSitesAPI.getDiveSiteProposals);
const withdraw = vi.mocked(diveSitesAPI.withdrawDiveSiteProposal);
const update = vi.mocked(diveSitesAPI.updateDiveSiteProposal);

const proposal = (over: Partial<DiveSiteProposal>): DiveSiteProposal => ({
  uuid: "proposal-1",
  kind: "new_site",
  status: "waiting",
  reason: null,
  site: { uuid: "site-1", name: "Walk Reef" },
  created_at: "2026-01-02T00:00:00Z",
  decided_at: null,
  show_proposer: false,
  ...over,
});

const answer = (data: DiveSiteProposal[]) =>
  getProposals.mockResolvedValue({
    data,
    total_count: data.length,
    has_more: false,
    page: 1,
    items_per_page: 10,
  });

beforeEach(() => {
  instance.state = {
    config: { commons_primary: true },
    isLoading: false,
  };
  getProposals.mockReset();
  withdraw.mockReset();
  withdraw.mockResolvedValue(undefined);
  update.mockReset();
  toast.mockReset();
});

describe("SiteProposalsPageContent", () => {
  it("dates a proposal from its full timestamp", async () => {
    answer([proposal({ created_at: "2026-01-02T12:00:00Z" })]);
    render(<SiteProposalsPageContent />);

    expect(await screen.findByText("Jan 2, 2026")).toBeInTheDocument();
    expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
  });

  it("lists each proposal with its outcome and any reason", async () => {
    answer([
      proposal({}),
      proposal({
        uuid: "proposal-2",
        kind: "change",
        status: "declined",
        reason: "Pin is on land",
        site: { uuid: "commons-1", name: "Kapal Polis" },
      }),
    ]);
    render(<SiteProposalsPageContent />);

    expect(
      await screen.findByRole("link", { name: "Walk Reef" }),
    ).toHaveAttribute("href", "/sites/site-1");
    expect(screen.getByText(/Waiting for review/)).toBeInTheDocument();
    expect(screen.getByText(/Declined/)).toBeInTheDocument();
    expect(screen.getByText("Pin is on land")).toBeInTheDocument();
  });

  it("withdraws one that waits, and leaves it listed as withdrawn", async () => {
    answer([proposal({})]);
    render(<SiteProposalsPageContent />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Withdraw" }),
    );

    await waitFor(() =>
      expect(screen.getByText(/Withdrawn/)).toBeInTheDocument(),
    );
    expect(withdraw).toHaveBeenCalledWith("proposal-1");
    expect(
      screen.queryByRole("button", { name: "Withdraw" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["waiting", true],
    ["accepted", true],
    ["declined", false],
    ["withdrawn", false],
  ] as const)(
    "puts the name switch on a %s proposal: %s",
    async (status, hasSwitch) => {
      answer([proposal({ status, show_proposer: true })]);
      render(<SiteProposalsPageContent />);

      await screen.findByRole("link", { name: "Walk Reef" });
      const toggle = screen.queryByRole("switch", {
        name: "Show my name to other divers",
      });
      if (hasSwitch) {
        expect(toggle).toBeChecked();
      } else {
        expect(toggle).not.toBeInTheDocument();
      }
    },
  );

  it("sends the switch's flip and shows the answer", async () => {
    answer([proposal({ status: "accepted" })]);
    update.mockResolvedValue(
      proposal({ status: "accepted", show_proposer: true }),
    );
    render(<SiteProposalsPageContent />);

    const toggle = await screen.findByRole("switch", {
      name: "Show my name to other divers",
    });
    await userEvent.click(toggle);

    expect(update).toHaveBeenCalledWith("proposal-1", { show_proposer: true });
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it("puts the switch back and says so when the flip is refused", async () => {
    answer([proposal({ show_proposer: true })]);
    update.mockRejectedValue(new Error("refused"));
    render(<SiteProposalsPageContent />);

    const toggle = await screen.findByRole("switch", {
      name: "Show my name to other divers",
    });
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
    expect(toggle).toBeChecked();
  });

  it("asks for nothing on a copy, where the routes do not exist", async () => {
    instance.state = {
      config: { commons_primary: false },
      isLoading: false,
    };
    render(<SiteProposalsPageContent />);

    expect(
      await screen.findByText("This copy takes no proposals."),
    ).toBeInTheDocument();
    expect(getProposals).not.toHaveBeenCalled();
  });
});
