import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveImportDialog } from "./dive-import-dialog";
import type { Dive } from "@/lib/api/dives";

// The seam is what reaches the API on Save, and that nothing does before it.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api/dives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dives")>();
  return {
    ...actual,
    divesAPI: {
      ...actual.divesAPI,
      updateDive: vi.fn(),
      deleteDiveFile: vi.fn(),
      attachRecordingFile: vi.fn(),
    },
  };
});

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const { divesAPI } = await import("@/lib/api/dives");

const storedDive: Dive = {
  uuid: "d1",
  user_uuid: "u1",
  dive_number: 2,
  start_time: "2026-09-08T15:18:10",
  submerged_time: 3163,
  dive_sites: [],
  gear_items: [],
  notes: "",
  created_at: "2026-09-08T13:18:10Z",
  mixtures: [],
  recordings: [
    {
      uuid: "r1",
      ordinal: 0,
      files: [
        {
          uuid: "f1",
          original_filename: "ocean.fit",
          content_type: "application/octet-stream",
          byte_size: 4096,
          parser_key: "fit",
          attach_order: 0,
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(divesAPI.deleteDiveFile).mockResolvedValue({ message: "ok" });
});

describe("DiveImportDialog", () => {
  it("deletes a struck-off file on Save, and leaves the dive's fields alone", async () => {
    const onSaved = vi.fn();
    render(
      <DiveImportDialog
        open
        onOpenChange={vi.fn()}
        dive={storedDive}
        onSaved={onSaved}
      />,
    );

    const save = screen.getByRole("button", { name: /save changes/i });
    expect(save).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Delete ocean.fit" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(divesAPI.deleteDiveFile).not.toHaveBeenCalled();

    await userEvent.click(save);

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(divesAPI.deleteDiveFile).toHaveBeenCalledWith("d1", "f1");
    expect(divesAPI.updateDive).not.toHaveBeenCalled();
  });
});
