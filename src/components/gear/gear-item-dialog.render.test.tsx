import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GearItemDialog, vesselFactsToSave } from "./gear-item-dialog";
import { gearAPI, type GearItem } from "@/lib/api/gear";
import { divesAPI } from "@/lib/api/dives";

// The pressure box reads the diver's units.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));

vi.mock("@/lib/api/gear", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/gear")>();
  return {
    ...actual,
    gearAPI: {
      ...actual.gearAPI,
      createGearItem: vi.fn(),
      updateGearItem: vi.fn(),
    },
  };
});

// The volume box lists the diver's recent volumes when it opens.
vi.mock("@/lib/api/dives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dives")>();
  return {
    ...actual,
    divesAPI: { ...actual.divesAPI, getRecentVolumes: vi.fn() },
  };
});

const createGearItem = vi.mocked(gearAPI.createGearItem);
const updateGearItem = vi.mocked(gearAPI.updateGearItem);

const item = (overrides: Partial<GearItem> = {}): GearItem => ({
  uuid: "item-1",
  name: "AL80",
  type: "cylinder",
  rented: false,
  is_archived: false,
  dive_count: 3,
  dive_time: 8100,
  volume: 11.1,
  working_pressure: 207,
  material: "aluminium",
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00+00:00",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(divesAPI.getRecentVolumes).mockResolvedValue([]);
  createGearItem.mockImplementation(async (data) => item({ ...data }) as never);
  updateGearItem.mockResolvedValue({ message: "Gear item updated" });
});

function renderDialog(props: Partial<Parameters<typeof GearItemDialog>[0]>) {
  const onSaved = vi.fn();
  render(
    <GearItemDialog
      open
      onOpenChange={() => {}}
      onSaved={onSaved}
      {...props}
    />,
  );
  return { onSaved };
}

const vesselFields = () => [
  screen.queryByLabelText("Volume (L)"),
  screen.queryByLabelText("Working pressure (bar)"),
  screen.queryByLabelText("Material"),
];

describe("GearItemDialog's vessel fields", () => {
  it("shows them only while the type is a cylinder", async () => {
    renderDialog({});

    expect(vesselFields()).toEqual([null, null, null]);
    await userEvent.selectOptions(screen.getByLabelText("Type"), "cylinder");
    for (const field of vesselFields()) expect(field).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Type"), "regulator");
    expect(vesselFields()).toEqual([null, null, null]);
  });

  it("creates a cylinder with its facts", async () => {
    renderDialog({});
    await userEvent.type(screen.getByLabelText(/^Name/), "AL80");
    await userEvent.selectOptions(screen.getByLabelText("Type"), "cylinder");
    await userEvent.type(screen.getByLabelText("Volume (L)"), "11.1");
    await userEvent.type(
      screen.getByLabelText("Working pressure (bar)"),
      "207",
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Material"),
      "aluminium",
    );
    await userEvent.click(screen.getByRole("button", { name: /create gear/i }));

    await waitFor(() => expect(createGearItem).toHaveBeenCalled());
    expect(createGearItem.mock.calls[0][0]).toMatchObject({
      name: "AL80",
      type: "cylinder",
      volume: 11.1,
      working_pressure: 207,
      material: "aluminium",
    });
  });

  it("opens preset to the type it is given, as a tank's picker opens it", () => {
    renderDialog({ initialType: "cylinder", initialName: "Twin 12" });

    expect(screen.getByLabelText("Type")).toHaveValue("cylinder");
    expect(screen.getByLabelText("Volume (L)")).toBeInTheDocument();
  });

  it("clears a cylinder's facts when this edit moves it to another type", async () => {
    const { onSaved } = renderDialog({ gearItem: item() });

    await userEvent.selectOptions(screen.getByLabelText("Type"), "regulator");
    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );

    await waitFor(() => expect(updateGearItem).toHaveBeenCalled());
    expect(updateGearItem.mock.calls[0][1]).toMatchObject({
      type: "regulator",
      volume: null,
      working_pressure: null,
      material: null,
    });
    expect(onSaved.mock.calls[0][0]).toMatchObject({ volume: null });
  });

  it("leaves an untyped item's facts standing when it is only renamed", async () => {
    // An import can leave the facts on an item with no type; nothing on screen
    // showed them, so nothing here may clear them.
    renderDialog({ gearItem: item({ type: null }) });

    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, "Old tank");
    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );

    await waitFor(() => expect(updateGearItem).toHaveBeenCalled());
    const sent = updateGearItem.mock.calls[0][1];
    expect(sent.name).toBe("Old tank");
    expect(sent).not.toHaveProperty("volume");
    expect(sent).not.toHaveProperty("working_pressure");
    expect(sent).not.toHaveProperty("material");
  });
});

describe("vesselFactsToSave", () => {
  const typed = {
    volume: 12,
    working_pressure: 232,
    material: "steel",
  } as const;

  it("sends the form's facts for a cylinder, a cleared one as null", () => {
    expect(vesselFactsToSave(typed, "cylinder", null)).toEqual(typed);
    expect(
      vesselFactsToSave(
        { volume: "", working_pressure: null, material: "" },
        "cylinder",
        "cylinder",
      ),
    ).toEqual({ volume: null, working_pressure: null, material: null });
  });

  it("clears them only where the type moved away from cylinder", () => {
    expect(vesselFactsToSave(typed, "regulator", "cylinder")).toEqual({
      volume: null,
      working_pressure: null,
      material: null,
    });
    expect(vesselFactsToSave(typed, null, "cylinder")).toEqual({
      volume: null,
      working_pressure: null,
      material: null,
    });
    // Any other item keeps what it stores, and a new one sends none.
    expect(vesselFactsToSave(typed, "regulator", "regulator")).toEqual({});
    expect(vesselFactsToSave(typed, null, null)).toEqual({});
    expect(vesselFactsToSave(typed, "regulator", undefined)).toEqual({});
  });
});
