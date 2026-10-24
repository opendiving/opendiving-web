import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveDraftsCard } from "./dive-drafts-card";
import type { DiveDraft, DiveDraftValuesRead } from "@/lib/api/dive-drafts";

vi.mock("@/lib/api/dive-drafts", () => ({
  diveDraftsAPI: { getDrafts: vi.fn(), deleteDraft: vi.fn() },
}));
vi.mock("@/lib/api/dive-sites", () => ({
  diveSitesAPI: { lookupDiveSitesByUuid: vi.fn() },
}));
const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

const { diveDraftsAPI } = await import("@/lib/api/dive-drafts");
const { diveSitesAPI } = await import("@/lib/api/dive-sites");

const draft = (
  uuid: string,
  values: Partial<DiveDraftValuesRead> = {},
): DiveDraft => ({
  uuid,
  created_at: "2026-10-20T08:00:00Z",
  updated_at: "2026-10-21T08:00:00Z",
  gear_set_uuid: null,
  values: {
    start_time: null,
    dive_site_uuids: null,
    ...values,
  } as DiveDraftValuesRead,
});

const page = (data: DiveDraft[]) => ({
  data,
  total_count: data.length,
  has_more: false,
  page: 1,
  items_per_page: 100,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(diveSitesAPI.lookupDiveSitesByUuid).mockResolvedValue([
    { uuid: "site-1", name: "Blue Hole" },
  ]);
  vi.mocked(diveDraftsAPI.deleteDraft).mockResolvedValue({
    message: "Dive draft deleted",
  });
});

describe("DiveDraftsCard", () => {
  it("draws nothing when the account has no drafts", async () => {
    vi.mocked(diveDraftsAPI.getDrafts).mockResolvedValue(page([]));
    const { container } = render(<DiveDraftsCard enabled />);

    await waitFor(() => expect(diveDraftsAPI.getDrafts).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(diveSitesAPI.lookupDiveSitesByUuid).not.toHaveBeenCalled();
  });

  it("lists each draft with its start, its site and Continue", async () => {
    vi.mocked(diveDraftsAPI.getDrafts).mockResolvedValue(
      page([
        draft("draft-1", {
          start_time: "2026-07-01T09:30:00+02:00",
          dive_site_uuids: ["site-1", "site-2"],
        }),
        draft("draft-2"),
      ]),
    );
    render(<DiveDraftsCard enabled />);

    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/July 1, 2026 at 09:30/);
    await waitFor(() => expect(rows[0]).toHaveTextContent(/Blue Hole/));
    expect(rows[1]).toHaveTextContent("Untitled draft");
    expect(rows[1]).toHaveTextContent(/Changed/);
    expect(
      within(rows[0]).getByRole("link", { name: /Continue/ }),
    ).toHaveAttribute("href", "/dives/new?draft=draft-1");
    // One lookup, over the primary sites only.
    expect(diveSitesAPI.lookupDiveSitesByUuid).toHaveBeenCalledTimes(1);
    expect(diveSitesAPI.lookupDiveSitesByUuid).toHaveBeenCalledWith(["site-1"]);
  });

  it("discards a draft after a confirmation, and goes with the last one", async () => {
    vi.mocked(diveDraftsAPI.getDrafts).mockResolvedValue(
      page([draft("draft-1")]),
    );
    const onVanished = vi.fn();
    const { container } = render(
      <DiveDraftsCard enabled onVanished={onVanished} />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /Discard/ }),
    );
    expect(diveDraftsAPI.deleteDraft).not.toHaveBeenCalled();
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Discard",
      }),
    );

    await waitFor(() =>
      expect(diveDraftsAPI.deleteDraft).toHaveBeenCalledWith("draft-1"),
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(onVanished).toHaveBeenCalled();
  });

  it("drops a draft that was already gone when discarded", async () => {
    vi.mocked(diveDraftsAPI.getDrafts).mockResolvedValue(
      page([draft("draft-1"), draft("draft-2")]),
    );
    vi.mocked(diveDraftsAPI.deleteDraft).mockRejectedValue({
      response: { status: 404 },
    });
    render(<DiveDraftsCard enabled />);

    await userEvent.click(
      (await screen.findAllByRole("button", { name: /Discard/ }))[0],
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Discard",
      }),
    );

    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(1),
    );
    expect(toast).not.toHaveBeenCalled();
  });
});
