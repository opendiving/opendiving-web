import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommonsSiteDialog } from "./commons-site-dialog";
import type { DiveSite } from "@/lib/api/dive-sites";

vi.mock("@/lib/api/dive-sites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-sites")>()),
  diveSitesAPI: {
    getDiveSite: vi.fn(),
    saveDiveSite: vi.fn(),
    updateDiveSite: vi.fn(),
  },
}));

// The tags picker reads the diver's vocabulary on mount.
vi.mock("@/lib/api/tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/tags")>()),
  fetchAllTags: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const saveDiveSite = vi.mocked(diveSitesAPI.saveDiveSite);
const updateDiveSite = vi.mocked(diveSitesAPI.updateDiveSite);
const getDiveSite = vi.mocked(diveSitesAPI.getDiveSite);

const UNSAVED: DiveSite = {
  uuid: "commons-1",
  name: "Kapal Polis",
  other_names: ["Police Boat"],
  location: { name: "Bali, Indonesia" },
  latitude: -8.27,
  longitude: 115.59,
  owner: "opendivingcommons",
  saved: false,
  attribution:
    "[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)",
  created_at: "2026-01-01T00:00:00Z",
};
const SAVED: DiveSite = {
  ...UNSAVED,
  saved: true,
  notes: "gate code 1234",
  tags: ["Wreck"],
};

const open = (site: DiveSite, onSaved = vi.fn()) => {
  const onOpenChange = vi.fn();
  render(
    <CommonsSiteDialog
      open
      onOpenChange={onOpenChange}
      site={site}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onOpenChange };
};

beforeEach(() => {
  saveDiveSite.mockReset();
  updateDiveSite.mockReset();
  getDiveSite.mockReset();
});

describe("CommonsSiteDialog", () => {
  it("shows the shared members and leaves only notes and tags to fill", () => {
    open(UNSAVED);

    expect(screen.getByRole("dialog")).toHaveTextContent("Kapal Polis");
    expect(screen.getByRole("dialog")).toHaveTextContent("Police Boat");
    expect(screen.getByRole("dialog")).toHaveTextContent("Bali, Indonesia");
    expect(
      screen.getByRole("link", {
        name: "Data © OpenStreetMap contributors, ODbL 1.0.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.getByLabelText("Tags")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Name/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Latitude")).not.toBeInTheDocument();
  });

  it("saves an unsaved record with what was written, in one request", async () => {
    saveDiveSite.mockResolvedValue(SAVED);
    const { onSaved, onOpenChange } = open(UNSAVED);

    await userEvent.type(screen.getByLabelText("Notes"), "Strong current");
    await userEvent.click(
      screen.getByRole("button", { name: "Save to your sites" }),
    );

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(SAVED));
    expect(saveDiveSite).toHaveBeenCalledWith("commons-1", {
      notes: "Strong current",
      tags: [],
    });
    expect(updateDiveSite).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("saves with neither, both being optional", async () => {
    saveDiveSite.mockResolvedValue(SAVED);
    const { onSaved } = open(UNSAVED);

    await userEvent.click(
      screen.getByRole("button", { name: "Save to your sites" }),
    );

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("sends a saved record's notes and tags alone, and reads it back", async () => {
    updateDiveSite.mockResolvedValue({ message: "ok" });
    const read = { ...SAVED, notes: "gate code 1234 and more" };
    getDiveSite.mockResolvedValue(read);
    const { onSaved } = open(SAVED);

    expect(screen.getByLabelText("Notes")).toHaveValue("gate code 1234");
    await userEvent.type(screen.getByLabelText("Notes"), " and more");
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(read));
    expect(updateDiveSite).toHaveBeenCalledWith("commons-1", {
      notes: "gate code 1234 and more",
      tags: ["Wreck"],
    });
    expect(saveDiveSite).not.toHaveBeenCalled();
  });

  it("stays open with the API's reason when the write is refused", async () => {
    updateDiveSite.mockRejectedValue({
      response: {
        data: {
          detail: "Save this Commons site to your sites before adding notes",
        },
      },
    });
    const { onSaved, onOpenChange } = open(SAVED);

    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Save this Commons site",
      ),
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
