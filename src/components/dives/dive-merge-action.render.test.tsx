import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveMergeAction } from "./dive-merge-action";
import type { Dive, DiveMergeResult, Recording } from "@/lib/api/dives";

vi.mock("@/lib/api/dives", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dives")>()),
  divesAPI: {
    getDiveNeighbors: vi.fn(),
    mergeDives: vi.fn(),
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const router = { push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { divesAPI } = await import("@/lib/api/dives");

function recording(overrides: Partial<Recording> = {}): Recording {
  return { uuid: "r1", ordinal: 0, files: [], ...overrides };
}

function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "part-2",
    dive_number: 2,
    start_time: "2026-09-08T15:21:53",
    duration: 2921,
    dive_sites: [],
    gear_items: [],
    notes: "",
    user_uuid: "u1",
    created_at: "2026-09-08T13:21:53Z",
    mixtures: [],
    recordings: [recording()],
    ...overrides,
  };
}

const previous = {
  uuid: "part-1",
  dive_number: 1,
  start_time: "2026-09-08T15:18:10",
};

function mergeResult(
  overrides: Partial<DiveMergeResult> = {},
): DiveMergeResult {
  return {
    dive: dive({ uuid: "part-1", dive_number: 1 }),
    removed_dive_uuid: "part-2",
    folded: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue({
    previous,
    next: null,
  });
});

describe("DiveMergeAction", () => {
  it("offers nothing on a dive logged by hand", async () => {
    // The API refuses a merge where either side has no recording - Subsurface's
    // own rule - so the button could only ever produce a 422. It also asks for
    // no neighbours, since it has nothing to do with them.
    const { container } = render(
      <DiveMergeAction dive={dive({ recordings: [] })} onMerged={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(divesAPI.getDiveNeighbors).not.toHaveBeenCalled();
  });

  it("offers nothing when the dive has no neighbours to fold into", async () => {
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue({
      previous: null,
      next: null,
    });

    render(<DiveMergeAction dive={dive()} onMerged={vi.fn()} />);

    await waitFor(() => expect(divesAPI.getDiveNeighbors).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: /merge/i }),
    ).not.toBeInTheDocument();
  });

  it("names the candidate by the diver's number and the day", async () => {
    // `#212` alone is ambiguous in a log with duplicate numbers, which the
    // numbering summary exists because logs have.
    render(<DiveMergeAction dive={dive()} onMerged={vi.fn()} />);

    await userEvent.click(
      await screen.findByRole("button", { name: /merge/i }),
    );
    expect(
      screen.getByRole("button", { name: /#1, Sep 8, 2026/ }),
    ).toBeVisible();
  });

  it("says plainly that the oxygen-exposure readings are not combined", async () => {
    // The natural reading of a merge is that everything comes along. CNS and OTU
    // are each device's own running accounting rather than a per-dive quantity
    // that can be added up, so every recording keeps its own.
    render(<DiveMergeAction dive={dive()} onMerged={vi.fn()} />);

    await userEvent.click(
      await screen.findByRole("button", { name: /merge/i }),
    );
    expect(
      screen.getByText(/keeps its own oxygen-exposure readings/i),
    ).toBeVisible();
  });

  it("goes to the dive that survived, which is usually the other one", async () => {
    // Which one survives is the server's answer - the earlier dive - not the
    // caller's, and the uuid that lost is soft-deleted and stops resolving. A
    // page that stayed put would 404 on its next reload.
    vi.mocked(divesAPI.mergeDives).mockResolvedValue(mergeResult());
    const onMerged = vi.fn();

    render(<DiveMergeAction dive={dive()} onMerged={onMerged} />);

    await userEvent.click(
      await screen.findByRole("button", { name: /merge/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /#1, Sep 8, 2026/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Merge" }));

    expect(divesAPI.mergeDives).toHaveBeenCalledWith(["part-2", "part-1"]);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/dives/part-1"),
    );
    expect(onMerged).not.toHaveBeenCalled();
  });

  it("re-reads in place when this dive is the one that survived", async () => {
    vi.mocked(divesAPI.mergeDives).mockResolvedValue(
      mergeResult({
        dive: dive({ uuid: "part-2" }),
        removed_dive_uuid: "part-1",
        folded: false,
      }),
    );
    const onMerged = vi.fn();

    render(<DiveMergeAction dive={dive()} onMerged={onMerged} />);

    await userEvent.click(
      await screen.findByRole("button", { name: /merge/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /#1, Sep 8, 2026/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Merge" }));

    await waitFor(() => expect(onMerged).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
  });

  it("re-reads the neighbours when the page bumps its reload token", async () => {
    // Nothing else can re-run that fetch: the dive's uuid is the same string
    // after a merge it survived, and it still has recordings, so a refetched
    // dive is a new object with identical effect dependencies. Left stale, the
    // dialog goes on offering the dive it just absorbed - soft-deleted, and a
    // second merge onto it fails with the generic toast - while the dive that
    // is now genuinely adjacent never appears. Repairing a three-part split
    // needs two merges in a row, so this is the ordinary case rather than a
    // corner.
    //
    // The token is the page's, not this component's, because the pager beside
    // it reads the same endpoint and goes stale on the same event. `Harness`
    // below is the layout's half of that contract.
    vi.mocked(divesAPI.mergeDives).mockResolvedValue(
      mergeResult({
        dive: dive({ uuid: "part-2" }),
        removed_dive_uuid: "part-1",
      }),
    );
    // What the server says once part 1 is gone: a different dive is adjacent.
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValueOnce({
      previous,
      next: null,
    });
    vi.mocked(divesAPI.getDiveNeighbors).mockResolvedValue({
      previous: {
        uuid: "part-0",
        dive_number: 0,
        start_time: "2026-09-08T14:02:00",
      },
      next: null,
    });

    function Harness() {
      const [token, setToken] = useState(0);
      return (
        <DiveMergeAction
          dive={dive()}
          reloadToken={token}
          onMerged={() => setToken((count) => count + 1)}
        />
      );
    }

    render(<Harness />);

    await userEvent.click(
      await screen.findByRole("button", { name: /merge/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /#1, Sep 8, 2026/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Merge" }));

    await waitFor(() =>
      expect(divesAPI.getDiveNeighbors).toHaveBeenCalledTimes(2),
    );

    // The absorbed dive is gone from the offer, and the newly adjacent one is in it.
    await userEvent.click(
      await screen.findByRole("button", { name: /merge/i }),
    );
    expect(
      screen.getByRole("button", { name: /#0, Sep 8, 2026/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /#1, Sep 8, 2026/ }),
    ).not.toBeInTheDocument();
  });
});
