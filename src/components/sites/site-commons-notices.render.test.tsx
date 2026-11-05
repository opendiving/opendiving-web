import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SiteCommonsMatchNotice,
  SiteProposalNotice,
} from "./site-commons-notices";
import type { DiveSite } from "@/lib/api/dive-sites";

vi.mock("@/lib/api/dive-sites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-sites")>()),
  diveSitesAPI: { withdrawDiveSiteProposal: vi.fn() },
}));

const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const withdraw = vi.mocked(diveSitesAPI.withdrawDiveSiteProposal);

const SITE: DiveSite = {
  uuid: "site-1",
  name: "Walk Reef",
  owner: "account",
  saved: true,
  attribution: null,
  created_at: "2026-01-01T00:00:00Z",
};
const PROPOSAL = {
  uuid: "proposal-1",
  kind: "new_site",
  status: "waiting",
  reason: null,
  created_at: "2026-01-02T00:00:00Z",
} as const;

beforeEach(() => {
  withdraw.mockReset();
  withdraw.mockResolvedValue(undefined);
});

describe("SiteProposalNotice", () => {
  it("draws nothing for a site with no proposal", () => {
    const { container } = render(
      <SiteProposalNotice site={SITE} onWithdrawn={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("says a proposal waits, and takes it back", async () => {
    const onWithdrawn = vi.fn();
    render(
      <SiteProposalNotice
        site={{ ...SITE, proposal: PROPOSAL }}
        onWithdrawn={onWithdrawn}
      />,
    );

    expect(screen.getByText("Waiting for review")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(onWithdrawn).toHaveBeenCalled());
    expect(withdraw).toHaveBeenCalledWith("proposal-1");
  });

  it("shows a decline's reason, with nothing left to withdraw", () => {
    render(
      <SiteProposalNotice
        site={{
          ...SITE,
          proposal: {
            ...PROPOSAL,
            status: "declined",
            reason: "Pin is on land",
          },
        }}
        onWithdrawn={vi.fn()}
      />,
    );

    expect(screen.getByText("Pin is on land")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Withdraw" }),
    ).not.toBeInTheDocument();
  });
});

describe("SiteCommonsMatchNotice", () => {
  it("names the record and offers replacing", async () => {
    const onReplace = vi.fn();
    render(
      <SiteCommonsMatchNotice
        site={{
          ...SITE,
          commons_match: { uuid: "commons-1", name: "Kapal Polis" },
        }}
        onReplace={onReplace}
      />,
    );

    expect(screen.getByRole("link", { name: "Kapal Polis" })).toHaveAttribute(
      "href",
      "/sites/commons-1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Replace with Commons site" }),
    );
    expect(onReplace).toHaveBeenCalled();
  });
});
