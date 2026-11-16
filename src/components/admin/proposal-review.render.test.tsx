import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProposalReview } from "./proposal-review";
import type { AdminDiveSiteProposal } from "@/lib/api/admin";
import type { DiveSiteSharedMembers } from "@/lib/api/dive-sites";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "admin-1", units: "metric" } }),
}));
vi.mock("@/components/map/proposal-map-lazy", () => ({
  ProposalMap: () => null,
}));
vi.mock("@/components/admin/proposal-matches", () => ({
  ProposalMatches: () => null,
}));
vi.mock("@/components/sites/site-history-card", () => ({
  SiteHistoryCard: ({
    siteUuid,
    asReviewer,
  }: {
    siteUuid: string;
    asReviewer: boolean;
  }) => (
    <div>
      History of {siteUuid}
      {asReviewer && " as a reviewer"}
    </div>
  ),
}));

const MEMBERS: DiveSiteSharedMembers = {
  name: "Kapal Polis",
  other_names: [],
  latitude: -8.27,
  longitude: 115.59,
  location_name: null,
  external_ids: [],
  depth_from: null,
  depth_to: null,
  water_type: null,
  altitude: null,
  entry_types: [],
};

const proposal = (
  kind: AdminDiveSiteProposal["kind"],
): AdminDiveSiteProposal => ({
  uuid: "proposal-1",
  kind,
  message: "",
  created_at: "2026-11-10T12:00:00Z",
  proposer: { name: "Ada Diver", accepted_count: 0, declined_count: 0 },
  site_uuid: "site-1",
  current: MEMBERS,
  proposed: { ...MEMBERS, name: "Kapal Polisi" },
  changed: ["name"],
  matches: [],
});

const review = (kind: AdminDiveSiteProposal["kind"]) =>
  render(
    <ProposalReview
      proposal={proposal(kind)}
      onBack={vi.fn()}
      onSettled={vi.fn()}
    />,
  );

describe("ProposalReview", () => {
  it("shows the history of the record a change would change", () => {
    review("change");

    expect(
      screen.getByText("History of site-1 as a reviewer"),
    ).toBeInTheDocument();
  });

  it("shows no history for a new site, there being no record yet", () => {
    review("new_site");

    expect(screen.queryByText(/History of/)).not.toBeInTheDocument();
  });
});
