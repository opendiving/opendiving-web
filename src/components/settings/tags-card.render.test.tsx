import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";

import type { Tag } from "@/lib/api/tags";
import { TagsCard } from "./tags-card";

// What a render reaches is the wiring: the list with its counts, a rename that
// PATCHes the one tag and re-reads the list, a refused rename that stays open and
// says why, and a delete behind the confirmation - each control named for its row.

const auth = vi.hoisted(() => ({ user: { uuid: "user-1" } }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

const toast = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => toast,
}));

vi.mock("@/lib/api/tags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/tags")>();
  return {
    ...actual,
    fetchAllTags: vi.fn(),
    tagsAPI: { ...actual.tagsAPI, renameTag: vi.fn(), deleteTag: vi.fn() },
  };
});

const { fetchAllTags, tagsAPI } = await import("@/lib/api/tags");

const tag = (uuid: string, name: string, dive_count: number): Tag => ({
  uuid,
  name,
  dive_count,
  created_at: "2026-01-01T00:00:00Z",
});

const NIGHT = tag("tag-night", "night", 1);
const DRIFT = tag("tag-drift", "drift", 0);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAllTags).mockResolvedValue([DRIFT, NIGHT]);
  vi.mocked(tagsAPI.renameTag).mockResolvedValue({ message: "Tag updated" });
  vi.mocked(tagsAPI.deleteTag).mockResolvedValue({ message: "Tag deleted" });
});

describe("TagsCard", () => {
  it("lists every tag with its dive count, a tag on no dive included", async () => {
    render(<TagsCard />);
    await screen.findByText("· 1 dive");

    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual(["drift · 0 dives", "night · 1 dive"]);
  });

  it("says so when there are none", async () => {
    vi.mocked(fetchAllTags).mockResolvedValue([]);
    render(<TagsCard />);

    expect(await screen.findByText(/no tags yet/i)).toBeInTheDocument();
  });

  // Two rows, because a constant name satisfies a one-row test.
  it("names each row's controls for its tag", async () => {
    render(<TagsCard />);
    await screen.findByText("· 1 dive");

    for (const name of ["night", "drift"]) {
      expect(
        screen.getByRole("button", { name: `Rename "${name}"` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `Delete "${name}"` }),
      ).toBeInTheDocument();
    }
  });

  it("renames in the row and reads the list again", async () => {
    render(<TagsCard />);
    await screen.findByText("· 1 dive");

    await userEvent.click(
      screen.getByRole("button", { name: 'Rename "night"' }),
    );
    const field = screen.getByRole("textbox", { name: 'New name for "night"' });
    expect(field).toHaveFocus();
    await userEvent.clear(field);
    await userEvent.type(field, " night dive {Enter}");

    await waitFor(() =>
      expect(tagsAPI.renameTag).toHaveBeenCalledWith("tag-night", "night dive"),
    );
    await waitFor(() => expect(fetchAllTags).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole("textbox", { name: 'New name for "night"' }),
    ).not.toBeInTheDocument();
  });

  it("spends no request on an unchanged name", async () => {
    render(<TagsCard />);
    await screen.findByText("· 1 dive");

    await userEvent.click(
      screen.getByRole("button", { name: 'Rename "night"' }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: 'Save the new name for "night"' }),
    );

    expect(tagsAPI.renameTag).not.toHaveBeenCalled();
  });

  it("keeps the row open with the API's reason when the name is taken", async () => {
    vi.mocked(tagsAPI.renameTag).mockRejectedValue(
      new AxiosError("Unprocessable", "422", undefined, undefined, {
        status: 422,
        statusText: "Unprocessable Entity",
        data: { detail: "A tag with this name already exists" },
        headers: {},
        config: { headers: new AxiosHeaders() },
      }),
    );
    render(<TagsCard />);
    await screen.findByText("· 1 dive");

    await userEvent.click(
      screen.getByRole("button", { name: 'Rename "night"' }),
    );
    const field = screen.getByRole("textbox", { name: 'New name for "night"' });
    await userEvent.clear(field);
    await userEvent.type(field, "Drift{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A tag with this name already exists",
    );
    expect(field).toBeInTheDocument();
  });

  it("deletes only after the confirmation, and reads the list again", async () => {
    render(<TagsCard />);
    await screen.findByText("· 1 dive");

    await userEvent.click(
      screen.getByRole("button", { name: 'Delete "drift"' }),
    );
    expect(tagsAPI.deleteTag).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() =>
      expect(tagsAPI.deleteTag).toHaveBeenCalledWith("tag-drift", undefined),
    );
    await waitFor(() => expect(fetchAllTags).toHaveBeenCalledTimes(2));
  });
});
