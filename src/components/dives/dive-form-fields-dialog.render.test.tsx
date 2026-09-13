import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiveFormFieldsDialog } from "./dive-form-fields-dialog";
import type { DiveFormPreset } from "@/lib/api/dive-form-presets";
import type { DiveFormPresets } from "@/hooks/useDiveFormPresets";
import type { DiveFormVisibility } from "@/hooks/useDiveFormVisibility";
import type { DiveFormFieldKey } from "@/lib/dive-form-fields";

// What "Save as" opens on is the one thing this file is about: the dialog has to
// answer "are these fields a preset I already have?" the same way the Fields
// trigger does, and hold that answer still while the diver edits underneath it.

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
    | "saveError"
  > = {
    hidden,
    isHidden: (key) => hidden.includes(key),
    isRevealed: () => false,
    isVisible: (key) => !hidden.includes(key),
    setHidden: vi.fn(),
    saveError: null,
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
    // The point of the whole arrangement. The match is against the live hidden
    // set, so a name recomputed each render would blank itself on the first
    // switch - which is exactly the edit the diver means to save back.
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
});
