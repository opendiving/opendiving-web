import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import ExportPage from "./page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("the former export page", () => {
  it("sends existing links to Storage settings", () => {
    ExportPage();
    expect(redirect).toHaveBeenCalledWith("/settings/storage");
  });
});
