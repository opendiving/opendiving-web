import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveFormFieldsDialog } from "./dive-form-fields-dialog";
import type { DiveFormPreset } from "@/lib/api/dive-form-presets";
import type { DiveFormPresets } from "@/hooks/useDiveFormPresets";
import type { DiveFormVisibility } from "@/hooks/useDiveFormVisibility";
import {
  canonicalHiddenFields,
  type DiveFormFieldKey,
} from "@/lib/dive-form-fields";

// Two things: what "Save as" opens on - the dialog has to answer "are these fields
// a preset I already have?" the same way the Fields trigger does, and hold that
// answer still while the diver edits underneath it - and which ways out of the
// dialog apply the switches' draft and which drop it.

function preset(name: string, hidden: DiveFormFieldKey[]): DiveFormPreset {
  return {
    uuid: `uuid-${name}`,
    user_uuid: "diver",
    name,
    hidden_fields: hidden,
    created_at: "2026-01-01T00:00:00Z",
  };
}

const TECHNICAL = preset("Technical", ["mixture.helium"]);
const BASIC = preset("Basic", [
  "mixture.helium",
  "mixture.po2_limit",
  "visibility",
]);

/**
 * Only the members this dialog and its switches actually reach for. The real
 * interface also carries the whole `UseFormReturn` of the dive form, which is
 * not stubbable and not consulted here - hence the cast, kept to a named subset
 * so that a member going missing from it is still a type error.
 */
function visibilityStub(hidden: DiveFormFieldKey[]): DiveFormVisibility {
  const stub: Pick<
    DiveFormVisibility,
    | "hidden"
    | "isHidden"
    | "isRevealed"
    | "isVisible"
    | "setHidden"
    | "selectedPresetUuid"
    | "selectPreset"
  > = {
    hidden,
    isHidden: (key) => hidden.includes(key),
    isRevealed: () => false,
    isVisible: (key) => !hidden.includes(key),
    setHidden: vi.fn(),
    selectedPresetUuid: null,
    selectPreset: vi.fn(),
  };
  return stub as DiveFormVisibility;
}

function presetsStub(rows: DiveFormPreset[] | null): DiveFormPresets {
  return {
    presets: rows,
    isLoading: rows === null,
    error: null,
    busyUuid: null,
    isWorking: false,
    createPreset: vi.fn(),
    renamePreset: vi.fn(),
    updateHiddenFields: vi.fn(),
    deletePreset: vi.fn(),
    restoreDefaults: vi.fn(),
  };
}

const saveAsBox = () => screen.getByRole("combobox", { name: /save as/i });

describe("DiveFormFieldsDialog", () => {
  it("opens on the preset the fields already match", () => {
    render(
      <DiveFormFieldsDialog
        open
        onOpenChange={vi.fn()}
        visibility={visibilityStub(["mixture.helium"])}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );

    expect(saveAsBox()).toHaveValue("Technical");
    // And the button says which of its two jobs it is about to do, unprompted.
    expect(
      screen.getByText('Replaces the fields saved in "Technical".'),
    ).toBeInTheDocument();
  });

  it("opens empty when the fields match nothing saved", () => {
    render(
      <DiveFormFieldsDialog
        open
        onOpenChange={vi.fn()}
        visibility={visibilityStub(["mixture.helium", "altitude"])}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );

    expect(saveAsBox()).toHaveValue("");
  });

  it("keeps the seeded name once the diver edits the fields under it", async () => {
    // The point of the whole arrangement. The match is against the switches'
    // draft, so a name recomputed each render would blank itself on the first
    // switch - which is exactly the edit the diver means to save back. A new
    // `visibility.hidden` moves it here: an untouched draft follows the live set.
    const { rerender } = render(
      <DiveFormFieldsDialog
        open
        onOpenChange={vi.fn()}
        visibility={visibilityStub(["mixture.helium"])}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );
    expect(saveAsBox()).toHaveValue("Technical");

    rerender(
      <DiveFormFieldsDialog
        open
        onOpenChange={vi.fn()}
        visibility={visibilityStub(["mixture.helium", "altitude"])}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );

    expect(saveAsBox()).toHaveValue("Technical");
  });

  it("picks the match up when the presets were still loading on open", () => {
    // The list is fetched by the Fields menu on mount, so it is normally there
    // long before anyone opens this - but it need not be, and "" is not an
    // answer worth keeping.
    const { rerender } = render(
      <DiveFormFieldsDialog
        open
        onOpenChange={vi.fn()}
        visibility={visibilityStub(["mixture.helium"])}
        presets={presetsStub(null)}
      />,
    );
    expect(saveAsBox()).toHaveValue("");

    rerender(
      <DiveFormFieldsDialog
        open
        onOpenChange={vi.fn()}
        visibility={visibilityStub(["mixture.helium"])}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );

    expect(saveAsBox()).toHaveValue("Technical");
  });

  it("drops the whole list down on the name it was seeded with", async () => {
    // A seeded name is not a filter. Keyed on the text, the chevron opened on a
    // one-row list holding the preset already named in the box, so replacing a
    // different one meant clearing the field first.
    const user = userEvent.setup();
    render(
      <DiveFormFieldsDialog
        open
        onOpenChange={vi.fn()}
        visibility={visibilityStub(["mixture.helium"])}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );

    await user.click(saveAsBox());

    expect(screen.getAllByRole("option").map((row) => row.textContent)).toEqual(
      ["Basic", "Technical"],
    );
  });

  it("walks the list with the arrow keys, stopping at its ends", async () => {
    const user = userEvent.setup();
    render(
      <DiveFormFieldsDialog
        open
        onOpenChange={vi.fn()}
        visibility={visibilityStub(["mixture.helium"])}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );
    await user.click(saveAsBox());

    const highlighted = () =>
      screen
        .getAllByRole("option")
        .find((row) => row.getAttribute("aria-selected") === "true")
        ?.textContent;

    await user.keyboard("{ArrowUp}");
    expect(highlighted()).toBe("Technical");
    await user.keyboard("{ArrowDown}");
    expect(highlighted()).toBe("Technical");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(highlighted()).toBe("Basic");

    await user.keyboard("{Enter}");
    expect(saveAsBox()).toHaveValue("Basic");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("filters the list once the diver types", async () => {
    const user = userEvent.setup();
    render(
      <DiveFormFieldsDialog
        open
        onOpenChange={vi.fn()}
        visibility={visibilityStub(["mixture.helium"])}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );

    await user.clear(saveAsBox());
    await user.type(saveAsBox(), "bas");

    expect(screen.getAllByRole("option").map((row) => row.textContent)).toEqual(
      ["Basic"],
    );
  });

  it("lets the diver type over the name it was seeded with", async () => {
    const user = userEvent.setup();
    render(
      <DiveFormFieldsDialog
        open
        onOpenChange={vi.fn()}
        visibility={visibilityStub(["mixture.helium"])}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );

    await user.clear(saveAsBox());
    await user.type(saveAsBox(), "Sidemount");

    expect(saveAsBox()).toHaveValue("Sidemount");
    expect(
      screen.getByText('Creates a new preset called "Sidemount".'),
    ).toBeInTheDocument();
  });

  it("drops the edited fields on Cancel without touching the form", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const visibility = visibilityStub(["mixture.helium"]);
    render(
      <DiveFormFieldsDialog
        open
        onOpenChange={onOpenChange}
        visibility={visibility}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );

    await user.click(screen.getByRole("switch", { name: "Altitude" }));
    expect(screen.getByRole("switch", { name: "Altitude" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(visibility.setHidden).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("applies the edited fields to the form on Apply", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const visibility = visibilityStub(["mixture.helium"]);
    render(
      <DiveFormFieldsDialog
        open
        onOpenChange={onOpenChange}
        visibility={visibility}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );

    await user.click(screen.getByRole("switch", { name: "Altitude" }));
    expect(visibility.setHidden).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(visibility.setHidden).toHaveBeenCalledWith(
      canonicalHiddenFields(["mixture.helium", "altitude"]),
      ["altitude"],
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("applies nothing when no switch moved", async () => {
    const user = userEvent.setup();
    const visibility = visibilityStub(["mixture.helium"]);
    render(
      <DiveFormFieldsDialog
        open
        onOpenChange={vi.fn()}
        visibility={visibility}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );

    await user.click(screen.getByRole("switch", { name: "Altitude" }));
    await user.click(screen.getByRole("switch", { name: "Altitude" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(visibility.setHidden).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the X",
      () => userEvent.click(screen.getByRole("button", { name: "Close" })),
    ],
    ["Escape", () => userEvent.keyboard("{Escape}")],
  ])("drops the edited fields on %s", async (_, dismiss) => {
    const onOpenChange = vi.fn();
    const visibility = visibilityStub(["mixture.helium"]);
    render(
      <DiveFormFieldsDialog
        open
        onOpenChange={onOpenChange}
        visibility={visibility}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );

    await userEvent.click(screen.getByRole("switch", { name: "Altitude" }));
    await dismiss();

    expect(visibility.setHidden).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes only the Save as list on Escape, keeping the dialog and the draft", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <DiveFormFieldsDialog
        open
        onOpenChange={onOpenChange}
        visibility={visibilityStub(["mixture.helium"])}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );

    await user.click(screen.getByRole("switch", { name: "Altitude" }));
    await user.click(saveAsBox());
    expect(screen.getAllByRole("option")).not.toHaveLength(0);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "Altitude" })).not.toBeChecked();
  });

  it("closes on the first Escape when the name matches no preset", async () => {
    // No rows, so no list on screen - nothing for the Escape to close first.
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <DiveFormFieldsDialog
        open
        onOpenChange={onOpenChange}
        visibility={visibilityStub(["mixture.helium"])}
        presets={presetsStub([BASIC, TECHNICAL])}
      />,
    );

    await user.clear(saveAsBox());
    await user.type(saveAsBox(), "Sidemount");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("saves the edited fields from the footer and applies them", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const visibility = visibilityStub(["mixture.helium"]);
    const presets = presetsStub([BASIC, TECHNICAL]);
    const edited = canonicalHiddenFields(["mixture.helium", "altitude"]);
    vi.mocked(presets.createPreset).mockResolvedValue(
      preset("Sidemount", edited),
    );
    render(
      <DiveFormFieldsDialog
        open
        onOpenChange={onOpenChange}
        visibility={visibility}
        presets={presets}
      />,
    );

    await user.click(screen.getByRole("switch", { name: "Altitude" }));
    await user.clear(saveAsBox());
    const save = screen.getByRole("button", { name: "Save preset" });
    expect(save).toBeDisabled();
    await user.type(saveAsBox(), "Sidemount");
    await user.click(save);

    expect(presets.createPreset).toHaveBeenCalledWith("Sidemount", edited);
    expect(visibility.setHidden).toHaveBeenCalledWith(edited, ["altitude"]);
    expect(visibility.selectPreset).toHaveBeenCalledWith("uuid-Sidemount");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
