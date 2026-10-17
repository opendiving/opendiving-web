import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RenumberDivesDialog } from "./renumber-dives-dialog";
import { divesAPI } from "@/lib/api/dives";

vi.mock("@/lib/api/dives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dives")>();
  return {
    ...actual,
    divesAPI: { ...actual.divesAPI, renumberDives: vi.fn() },
  };
});

const renumberDives = vi.mocked(divesAPI.renumberDives);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const renderDialog = () =>
  render(
    <RenumberDivesDialog
      open
      onOpenChange={() => {}}
      onRenumbered={() => {}}
    />,
  );

const startAt = () => screen.getByLabelText("Start at");

describe("RenumberDivesDialog's starting number", () => {
  it("asks for no preview past what a dive number can hold", async () => {
    renderDialog();
    await userEvent.clear(startAt());
    await userEvent.type(startAt(), "2147483648");

    expect(
      screen.getByText("Enter a starting number from 1 to 2,147,483,647."),
    ).toBeInTheDocument();
    expect(renumberDives).not.toHaveBeenCalled();
  });

  it("shows the API's reason when the last dive would be numbered past it", async () => {
    const reason =
      "Starting at 2147483000, the last of these 900 dives would be numbered past 2147483647.";
    renumberDives.mockRejectedValue({
      response: { status: 422, data: { detail: reason } },
    });
    renderDialog();
    await userEvent.clear(startAt());
    await userEvent.type(startAt(), "2147483000");

    expect(await screen.findByText(reason)).toBeInTheDocument();
  });

  it("blames the connection only when the API gave no reason", async () => {
    renumberDives.mockRejectedValue(new Error("Network Error"));
    renderDialog();

    expect(
      await screen.findByText(
        "Couldn't load a preview. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
  });
});
