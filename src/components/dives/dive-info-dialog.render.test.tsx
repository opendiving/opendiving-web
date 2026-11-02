import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveInfoDialog } from "./dive-info-dialog";
import { dive } from "@/test/dive-fixtures";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

describe("DiveInfoDialog", () => {
  it("lists every own field in form order, the unrecorded ones too", async () => {
    render(
      <DiveInfoDialog
        dive={dive({ max_depth: 18.4, boat_name: null, notes: "" })}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Info" }));
    const dialog = screen.getByRole("dialog", { name: "Dive information" });

    const labels = within(dialog)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(labels).toEqual([
      "Entry type",
      "Boat name",
      "Dive type",
      "Start time",
      "Dive number",
      "Dive time",
      "Maximum depth",
      "Average depth",
      "Bottom temperature",
      "Visibility",
      "Water type",
      "Altitude",
      "Waves",
      "Current",
      "Weather",
      "Air temperature",
      "Weight",
      "Rating",
      "Tags",
      "Notes",
    ]);

    const value = (label: string) =>
      within(dialog).getByText(label, { selector: "dt" }).nextElementSibling;
    expect(value("Maximum depth")).toHaveTextContent("18.4 m");
    expect(value("Boat name")).toHaveTextContent("-");
    expect(value("Notes")).toHaveTextContent("-");
  });
});
