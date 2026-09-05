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
              presets={presets.presets ?? []}
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
            <DiveFormPresetList presets={presets} visibility={visibility} />
          </TabsContent>
        </Tabs>

        <FormApiError error={presets.error} />
        <FormApiError error={visibility.saveError} />
      </DialogContent>
    </Dialog>
  );
}
