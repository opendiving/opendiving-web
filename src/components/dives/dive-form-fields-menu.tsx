"use client";

import { useState } from "react";
import { Check, ChevronDown, Settings, SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { HERO_CONTROL } from "@/components/ui/map-hero";
import { cn } from "@/lib/utils";
import { DiveFormFieldsDialog } from "@/components/dives/dive-form-fields-dialog";
import { useDiveFormPresets } from "@/hooks/useDiveFormPresets";
import {
  ALL_FIELDS_PRESET_NAME,
  currentDiveFormPreset,
} from "@/lib/api/dive-form-presets";
import type { DiveFormVisibility } from "@/hooks/useDiveFormVisibility";

/** What the trigger reads while the account's presets are still on the wire. */
const LOADING_LABEL = "Fields";

/**
 * What a hidden set matching no saved preset is called - on the trigger, and nowhere
 * else. It is deliberately not an entry in the menu: there is nothing to apply, and a
 * row that cannot be picked in a list of rows that can is a trap.
 */
const CUSTOM_LABEL = "Custom";

interface DiveFormFieldsMenuProps {
  visibility: DiveFormVisibility;
}

/**
 * The Fields control in the dive form page's top row, opposite the way back: a menu of
 * the account's presets, and Configure for everything else. Dressed as the back link
 * is, a hero control.
 *
 * **The trigger is labelled with the state, not with the control's name**, by
 * `currentDiveFormPreset`: the preset the diver picked while its set still matches,
 * "All" for nothing hidden, and "Custom" for a set no preset holds. Save as seeds its
 * name from the same answer, so the two can never disagree. The accessible name keeps
 * "Fields" in front of it, so the control is still findable by what it does.
 *
 * **Picking a preset applies its set and remembers the pick.** A preset is a snapshot:
 * applying copies its hidden set into the account's current state, and editing a field
 * afterwards changes the state rather than the preset - at which point the trigger
 * says "Custom" until the diver writes it back from Configure.
 */
export function DiveFormFieldsMenu({ visibility }: DiveFormFieldsMenuProps) {
  const presets = useDiveFormPresets();
  const [isConfigureOpen, setIsConfigureOpen] = useState(false);

  const rows = presets.presets;
  // One answer, shared with Save as: the preset the diver picked while its set still
  // matches, so two presets holding the same set are told apart by which was applied.
  const current = currentDiveFormPreset(
    rows,
    visibility.hidden,
    visibility.selectedPresetUuid,
  );
  const label =
    current.kind === "saved"
      ? current.preset.name
      : current.kind === "all"
        ? ALL_FIELDS_PRESET_NAME
        : current.kind === "loading"
          ? LOADING_LABEL
          : CUSTOM_LABEL;

  const presetItem = (
    key: string,
    name: string,
    isCurrent: boolean,
    onSelect: () => void,
  ) => (
    <DropdownMenuItem key={key} onSelect={onSelect}>
      {/* The check is a mark *and* a word, for the reason the dialog's own list
          carries: colour and an icon alone would leave the current preset unnamed
          to a screen reader. */}
      <Check
        className={`mr-2 h-3.5 w-3.5 text-teal ${isCurrent ? "" : "invisible"}`}
        aria-hidden
      />
      <span aria-current={isCurrent ? "true" : undefined}>{name}</span>
      {isCurrent && <span className="sr-only">(current fields)</span>}
    </DropdownMenuItem>
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            // The visible text is the *state*, so the name has to carry what the
            // control is as well - and it must contain the visible text, which is
            // WCAG's Label in Name. While the list is still loading the two are the
            // same word, and repeating it would read as a stutter.
            aria-label={
              label === LOADING_LABEL ? undefined : `Fields: ${label}`
            }
            className={cn("gap-2", HERO_CONTROL)}
          >
            {/* Sliders, then the state, then the chevron: what the control is about,
                what it currently says, and last the mark that it opens - which is
                where a menu button conventionally carries it. `aria-hidden` on both
                icons, since the trigger is named by `aria-label` and Radix has
                already said `haspopup`. */}
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {label}
            <ChevronDown className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          {presetItem(
            "all",
            ALL_FIELDS_PRESET_NAME,
            current.kind === "all",
            () => visibility.applyPreset([], null),
          )}
          {presets.isLoading ? (
            <DropdownMenuItem disabled>Loading presets...</DropdownMenuItem>
          ) : (
            rows?.map((preset) =>
              presetItem(
                preset.uuid,
                preset.name,
                current.kind === "saved" && current.preset.uuid === preset.uuid,
                () => visibility.applyPreset(preset.hidden_fields, preset.uuid),
              ),
            )
          )}
          <DropdownMenuSeparator />
          {/* The dialog mounts while this item still has focus - Radix flushes
              `onSelect` before it closes the menu - and `DialogContent` hands
              focus back to the Fields button, not to the item, when it closes. */}
          <DropdownMenuItem onSelect={() => setIsConfigureOpen(true)}>
            <Settings className="mr-2 h-3.5 w-3.5" aria-hidden />
            Configure...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DiveFormFieldsDialog
        open={isConfigureOpen}
        onOpenChange={setIsConfigureOpen}
        visibility={visibility}
        presets={presets}
      />
    </>
  );
}
