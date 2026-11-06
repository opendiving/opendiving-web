import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DataSettingsPage from "./page";

// Each card's own behaviour is tested beside it; what only the page reaches is that both
// are on it, and that the export card is handed the signed-in diver's name.
const mocks = vi.hoisted(() => ({ download: vi.fn() }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { username: "alex" } }),
}));

vi.mock("@/lib/api/storage", () => ({
  storageAPI: { getUsage: () => new Promise(() => {}) },
}));

vi.mock("@/lib/api/export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/export")>()),
  exportAPI: { download: mocks.download },
}));

vi.mock("@/lib/download", () => ({
  saveApiDownload: (_path: string, fetchFile: () => Promise<unknown>) =>
    fetchFile().then(() => 0),
}));

describe("the Data settings page", () => {
  it("carries the usage card and the export card for the signed-in diver", async () => {
    mocks.download.mockResolvedValue({ blob: new Blob(), filename: "a.zip" });
    render(<DataSettingsPage />);

    expect(screen.getByRole("heading", { name: "Storage" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Data export" })).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", { name: "Download Full archive" }),
    );
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith("archive", "alex");
  });
});
