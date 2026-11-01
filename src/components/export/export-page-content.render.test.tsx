import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ExportPageContent } from "./export-page-content";

// The import has a page of its own, so nothing here offers to bring files in.

vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({
    user: { username: "alex" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("@/components/export/data-export-card", () => ({
  DataExportCard: () => <section aria-label="Export card" />,
}));

describe("the export page", () => {
  it("is titled Export and carries the export card alone", () => {
    const { container } = render(<ExportPageContent />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Export" }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Export card" })).toBeVisible();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText(/import/i)).toBeNull();
  });
});
