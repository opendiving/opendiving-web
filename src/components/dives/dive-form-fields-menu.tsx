"use client";

import { useState } from "react";
import { Check, Settings, SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DiveFormFieldsDialog } from "@/components/dives/dive-form-fields-dialog";
import { useDiveFormPresets } from "@/hooks/useDiveFormPresets";
import { hiddenFieldsEqual } from "@/lib/dive-form-fields";
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
  /** The signed-in diver, whose presets these are - the API refuses anyone else's. */
  userId: string;
}

/**
 * The Fields control at the end of the dive card's title row: a menu of the account's
 * presets, and Configure for everything else.
 *
 * **Positioned rather than laid out**, for the reason `EntryUnitLabelRow` documents: a
 * flex row would give the control a say in the header's height, and the header has to
 * occupy the same vertical space with it as without it. `type="button"` because this
 * renders on a card whose content is a `<form>` and the default type submits.
 *
 * **The trigger is labelled with the state, not with the control's name.** A hidden set
 * equal to a saved preset's reads as that preset; one equal to none reads "Custom".
 * That is the same "which preset matches?" comparison the dialog marks a row with, so
 * the two can never disagree - and it means the button answers the question a diver
 * opens this menu to ask. The accessible name keeps "Fields" in front of it, so the
 * control is still findable by what it does.
 *
 * **Picking a preset applies it and nothing else.** A preset is a snapshot: applying
 * copies its hidden set into the account's current state, and editing a field
 * afterwards changes the state rather than the preset - at which point the trigger
 * says "Custom" until the diver writes it back from Configure.
 */
export function DiveFormFieldsMenu({
  visibility,
  userId,
}: DiveFormFieldsMenuProps) {
  const presets = useDiveFormPresets(userId);
  const [isConfigureOpen, setIsConfigureOpen] = useState(false);

  const rows = presets.presets;
  const current = rows?.find((preset) =>
    hiddenFieldsEqual(preset.hidden_fields, visibility.hidden),
  );
  const label = rows === null ? LOADING_LABEL : (current?.name ?? CUSTOM_LABEL);

  return (
    <span className="absolute inset-y-0 right-0 flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            // The visible text is the *state*, so the name has to carry what the
            // control is as well - and it must contain the visible text, which is
            // WCAG's Label in Name. While the list is still loading the two are the
            // same word, and repeating it would read as a stutter.
            aria-label={rows === null ? undefined : `Fields: ${label}`}
            className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs leading-none text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {label}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          {presets.isLoading ? (
            <DropdownMenuItem disabled>Loading presets...</DropdownMenuItem>
          ) : rows && rows.length > 0 ? (
            rows.map((preset) => (
              <DropdownMenuItem
                key={preset.uuid}
                onSelect={() => visibility.setHidden(preset.hidden_fields)}
              >
                {/* The check is a mark *and* a word, for the reason the dialog's
                    own list carries: colour and an icon alone would leave the
                    current preset unnamed to a screen reader. */}
                <Check
                  className={`mr-2 h-3.5 w-3.5 text-teal ${
                    preset.uuid === current?.uuid ? "" : "invisible"
                  }`}
                  aria-hidden
                />
                <span
                  aria-current={
                    preset.uuid === current?.uuid ? "true" : undefined
                  }
                >
                  {preset.name}
                </span>
                {preset.uuid === current?.uuid && (
                  <span className="sr-only">(current fields)</span>
                )}
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>No presets yet</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {/* Radix closes the menu on select and returns focus to the trigger as it
              unmounts, which is exactly what the dialog wants: it mounts into a
              settled focus, rather than racing the menu for it. */}
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
    </span>
  );
}
