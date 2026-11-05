import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProposeSiteDialog } from "./propose-site-dialog";
import {
  COMMONS_ATTESTATIONS,
  type DiveSite,
  type DiveSiteCommonsMatch,
} from "@/lib/api/dive-sites";

vi.mock("@/lib/api/dive-sites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-sites")>()),
  diveSitesAPI: { getCommonsMatches: vi.fn(), proposeDiveSite: vi.fn() },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const getCommonsMatches = vi.mocked(diveSitesAPI.getCommonsMatches);
const proposeDiveSite = vi.mocked(diveSitesAPI.proposeDiveSite);

const SITE: DiveSite = {
  uuid: "01890000-0000-7000-8000-000000000001",
  name: "Walk Reef",
  latitude: 27.12345678,
  longitude: 34.5,
  location: { name: "Dahab", latitude: 28.5, longitude: 34.5 },
  notes: "gate code 1234",
  tags: ["Secret"],
  owner: "account",
  saved: true,
  attribution: null,
  created_at: "2026-01-01T00:00:00Z",
};

const CREDIT =
  "[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)";

const match = (
  over: Partial<DiveSiteCommonsMatch> = {},
): DiveSiteCommonsMatch => ({
  uuid: "commons-1",
  name: "Kapal Polis",
  other_names: [],
  latitude: 27.1,
  longitude: 34.5,
  location_name: "Dahab",
  external_ids: [],
  attribution: CREDIT,
  rule: "within_20_m",
  distance_metres: 15,
  qualifier_siblings: false,
  ...over,
});

const open = (site: DiveSite = SITE) => {
  const onProposed = vi.fn();
  const onReplace = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ProposeSiteDialog
      open
      onOpenChange={onOpenChange}
      site={site}
      onProposed={onProposed}
      onReplace={onReplace}
    />,
  );
  return { onProposed, onReplace, onOpenChange };
};

const continueAsNew = async () =>
  userEvent.click(
    await screen.findByRole("button", { name: "Continue as a new site" }),
  );

beforeEach(() => {
  getCommonsMatches.mockReset();
  proposeDiveSite.mockReset();
  getCommonsMatches.mockResolvedValue([]);
});

describe("ProposeSiteDialog", () => {
  it("asks first whether the site is in the Commons, and credits each source once", async () => {
    getCommonsMatches.mockResolvedValue([
      match(),
      match({ uuid: "commons-2", name: "Kapal Polis East" }),
    ]);
    const { onReplace } = open();

    expect(
      await screen.findByText("Is it already in the Commons?"),
    ).toBeInTheDocument();
    const replace = await screen.findAllByRole("button", {
      name: "Replace with Commons site",
    });
    expect(replace).toHaveLength(2);
    expect(
      screen.getAllByRole("link", {
        name: "Data © OpenStreetMap contributors, ODbL 1.0.",
      }),
    ).toHaveLength(1);
    expect(screen.getAllByText(/15 m away/)).toHaveLength(2);

    await userEvent.click(replace[1]);
    expect(onReplace).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: "commons-2" }),
    );
  });

  it("offers no way on for an identity match", async () => {
    getCommonsMatches.mockResolvedValue([match({ rule: "identity" })]);
    open();

    await screen.findByRole("button", { name: "Replace with Commons site" });
    expect(
      screen.queryByRole("button", { name: "Continue as a new site" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/shares a registry entry with a Commons site/),
    ).toBeInTheDocument();
  });

  it("says a pin is needed, and offers no way on without one", async () => {
    open({ ...SITE, latitude: null, longitude: null });

    expect(
      await screen.findByText(/A site needs a pin to be proposed/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue as a new site" }),
    ).not.toBeInTheDocument();
  });

  it("offers no way on when the matches could not be read", async () => {
    getCommonsMatches.mockRejectedValue(new Error("down"));
    open();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /look through the Commons/,
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Continue as a new site" }),
    ).not.toBeInTheDocument();
  });

  it("shows exactly what would be published, and names what would not", async () => {
    open();
    await continueAsNew();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(SITE.uuid);
    expect(dialog).toHaveTextContent(/encodes when you created this site/);
    // Six decimals, as a record keeps it, and the locality's name with no centre.
    expect(dialog).toHaveTextContent("27.123457, 34.5");
    expect(dialog).toHaveTextContent("Dahab");
    expect(dialog).not.toHaveTextContent("28.5");

    expect(dialog).toHaveTextContent(/Your notes and your tags stay private/);
    expect(dialog).toHaveTextContent(
      /public and stays, whatever becomes of your account/,
    );
    expect(dialog).not.toHaveTextContent("gate code 1234");
    expect(dialog).not.toHaveTextContent("Secret");
  });

  it("sends only on the tick, with the attestation word for word", async () => {
    proposeDiveSite.mockResolvedValue({
      uuid: "proposal-1",
      kind: "new_site",
      status: "waiting",
      reason: null,
      site: { uuid: SITE.uuid, name: SITE.name },
      created_at: "2026-01-02T00:00:00Z",
      decided_at: null,
    });
    const { onProposed, onOpenChange } = open();
    await continueAsNew();

    const send = screen.getByRole("button", { name: "Send proposal" });
    expect(send).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Read the CC0 1.0 deed" }),
    ).toHaveAttribute(
      "href",
      "https://creativecommons.org/publicdomain/zero/1.0/",
    );

    await userEvent.type(
      screen.getByLabelText("A word for the reviewer"),
      "North of the jetty",
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: COMMONS_ATTESTATIONS.new_site }),
    );
    await userEvent.click(send);

    await waitFor(() =>
      expect(proposeDiveSite).toHaveBeenCalledWith(SITE.uuid, {
        attestation: COMMONS_ATTESTATIONS.new_site,
        message: "North of the jetty",
      }),
    );
    await waitFor(() => expect(onProposed).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the API's refusal and stays open", async () => {
    proposeDiveSite.mockRejectedValue({
      isAxiosError: true,
      response: { status: 429, data: { detail: "Too many proposals today" } },
    });
    const { onProposed } = open();
    await continueAsNew();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(
      screen.getByRole("button", { name: "Send proposal" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).not.toBeEmptyDOMElement(),
    );
    expect(onProposed).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send proposal" })).toBeEnabled();
  });
});
