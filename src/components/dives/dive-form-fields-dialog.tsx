"use client";

import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormApiError } from "@/components/ui/form-api-error";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DiveFormFieldSwitches } from "@/components/dives/dive-form-field-switches";
import { DiveFormPresetList } from "@/components/dives/dive-form-preset-list";
import { DiveFormPresetSaveAs } from "@/components/dives/dive-form-preset-save-as";
import { hiddenFieldsEqual } from "@/lib/dive-form-fields";
import type { DiveFormFieldKey } from "@/lib/dive-form-fields";
import type { DiveFormPreset } from "@/lib/api/dive-form-presets";
import type { DiveFormPresets } from "@/hooks/useDiveFormPresets";
import type { DiveFormVisibility } from "@/hooks/useDiveFormVisibility";

interface DiveFormFieldsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibility: DiveFormVisibility;
  /** Held by the Fields menu and handed down, so opening this refetches nothing. */
  presets: DiveFormPresets;
}

/**
 * The preset whose saved fields are exactly the ones on screen, or `""` for none
 * - the same comparison the Fields trigger makes to decide between a preset's
 * name and "Custom", so the two can never disagree about what is current.
 *
 * Recomputed on every render, deliberately. Freezing it at the moment the
 * dialog opened is the behaviour "Save as" needs, and it gets that from being
 * *mounted* then rather than from anything here holding a value still - see the
 * `key` at the call site.
 */
function matchingPresetName(
  presets: readonly DiveFormPreset[] | null,
  hidden: readonly DiveFormFieldKey[],
): string {
  return (
    presets?.find((preset) => hiddenFieldsEqual(preset.hidden_fields, hidden))
      ?.name ?? ""
  );
}

/**
 * Configure: the fields the dive form asks for, and the presets they can be saved as.
 *
 * **Two tabs, Fields first and default**, because that is what a diver opens this for.
 * Presets is the housekeeping tab - renaming, deleting, restoring the three seeded
 * defaults - and nothing on it changes what the form shows.
 *
 * **Saving lives with the fields, not with the presets.** "Save as" sits at the foot of
 * the Fields tab, where the thing being saved is on screen above it; a preset row is
 * the wrong place to write the current form into, which is what the per-row "Update
 * with current fields" button was.
 *
 * **A dialog rather than a panel on the card.** Nothing in it is a form control of the
 * dive. Radix portals the content to `document.body`, so the DOM has no nested `<form>`;
 * the two forms inside it still go through `dialogFormSubmit`, because React bubbles
 * submit events through its own tree and not the DOM's (DECISIONS.md, "A dialog's
 * submit event bubbles into the form that opened it").
 */
export function DiveFormFieldsDialog({
  open,
  onOpenChange,
  visibility,
  presets,
}: DiveFormFieldsDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Radix focuses the first tabbable descendant on open. Focus goes to the
        // container instead so that Enter on a freshly opened dialog does nothing
        // at all - `ConfirmDialog` documents the same move for the same reason -
        // and `focus:outline-none` because this is a focus *holder*, not a control,
        // and a ring around the whole dialog reads as an error state.
        className="sm:max-w-2xl focus:outline-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        ref={contentRef}
      >
        <DialogHeader>
          <DialogTitle>Configure fields</DialogTitle>
          <DialogDescription>
            Choose what the dive form asks for. This is saved to your account
            and applies to every dive you log.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="fields">
          <TabsList>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="presets">Presets</TabsTrigger>
          </TabsList>

          <TabsContent value="fields" className="space-y-6 pt-4">
            <DiveFormFieldSwitches visibility={visibility} />
            <DiveFormPresetSaveAs
              // `initialName` is read once, when this mounts - which is when the
              // dialog opens, `DialogPortal` rendering `null` while closed. That
              // is what makes the seed a snapshot of the fields as they were
              // *opened* on, and it has to be: the value below is recomputed as
              // the diver flips switches, so a control that kept adopting it
              // would blank its own name on the first edit - precisely the edit
              // they mean to save back under that name.
              //
              // The one moment the mount is too early is when the account's
              // presets are still on the wire, when there is nothing to match
              // against yet. Keyed on that, so their arrival remounts the
              // control on the answer instead of leaving it seeded with "".
              key={presets.presets === null ? "awaiting-presets" : "presets"}
              presets={presets.presets ?? []}
              initialName={matchingPresetName(
                presets.presets,
                visibility.hidden,
              )}
              disabled={presets.isWorking}
              onSave={(name, existing) => {
                if (existing) {
                  void presets.updateHiddenFields(existing, visibility.hidden);
                } else {
                  void presets.createPreset(name, visibility.hidden);
                }
              }}
            />
          </TabsContent>

          <TabsContent value="presets" className="pt-4">
            <DiveFormPresetList presets={presets} />
          </TabsContent>
        </Tabs>

        <FormApiError error={presets.error} />
        <FormApiError error={visibility.saveError} />
      </DialogContent>
    </Dialog>
  );
}
