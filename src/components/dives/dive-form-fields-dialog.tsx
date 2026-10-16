"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormApiError } from "@/components/ui/form-api-error";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DiveFormFieldSwitches,
  type DiveFormFieldsView,
} from "@/components/dives/dive-form-field-switches";
import { DiveFormPresetList } from "@/components/dives/dive-form-preset-list";
import { DiveFormPresetSaveAs } from "@/components/dives/dive-form-preset-save-as";
import {
  canonicalHiddenFields,
  hiddenFieldsEqual,
  type DiveFormFieldKey,
} from "@/lib/dive-form-fields";
import {
  currentDiveFormPreset,
  type DiveFormPreset,
} from "@/lib/api/dive-form-presets";
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
 * The saved preset the fields on screen are on, or `""` for none - the built-in "All"
 * included, which nothing can be saved over. The same answer the Fields trigger gives,
 * so the two can never disagree about what is current.
 *
 * Recomputed on every render, deliberately. Freezing it at the moment the
 * dialog opened is the behaviour "Save as" needs, and it gets that from being
 * *mounted* then rather than from anything here holding a value still - see the
 * `key` at the call site.
 */
function matchingPresetName(
  presets: readonly DiveFormPreset[] | null,
  hidden: readonly DiveFormFieldKey[],
  pickedUuid: string | null,
): string {
  const current = currentDiveFormPreset(presets, hidden, pickedUuid);
  return current.kind === "saved" ? current.preset.name : "";
}

/**
 * Configure: the fields the dive form asks for, and the presets they can be saved as.
 *
 * **Two tabs, Fields first and default**, because that is what a diver opens this for.
 * Presets is the housekeeping tab - renaming, deleting, restoring the three seeded
 * defaults - and nothing on it changes what the form shows.
 *
 * **Saving lives with the fields, not with the presets.** "Save as" sits at the foot of
 * the Fields tab, where the thing being saved is on screen above it, and its Save
 * button shows in the footer only while that tab is; a preset row is the wrong place
 * to write the current form into, which is what the per-row "Update with current
 * fields" button was.
 *
 * **The switches edit a draft.** Nothing reaches the form until Apply or Save preset;
 * Cancel, the X and Escape drop it, as they do in every other dialog. So there is
 * nothing to undo, and no hide has emptied a value it would have to bring back. The switches
 * preview what applying the draft will do, revealed fields included: `setHidden` drops
 * every key it hides from the revealed set. Preset writes on the Presets tab go to the
 * server at once and are not part of the draft.
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
  // `null` until a switch is flipped, so an untouched dialog follows the live set.
  const [draft, setDraft] = useState<readonly DiveFormFieldKey[] | null>(null);
  // A draft equal to the stored set still changes the form when it hides a field that
  // is on screen only because it holds a value - `setHidden` takes those back off.
  const changed =
    draft !== null &&
    (!hiddenFieldsEqual(draft, visibility.hidden) ||
      draft.some((key) => visibility.isRevealed(key)));

  const fields = useMemo<DiveFormFieldsView>(() => {
    // Canonical, as `setHidden` stores it - a preset saved from the draft gets it as is.
    const setHidden = (next: readonly DiveFormFieldKey[]) =>
      setDraft(canonicalHiddenFields(next));
    if (!changed) return { ...visibility, setHidden };
    const hidden = new Set(draft);
    const isRevealed = (key: DiveFormFieldKey) =>
      visibility.isRevealed(key) && !hidden.has(key);
    return {
      hidden: draft,
      isHidden: (key) => hidden.has(key),
      isRevealed,
      isVisible: (key) => !hidden.has(key) || isRevealed(key),
      setHidden,
    };
  }, [changed, draft, visibility]);

  const close = (apply: boolean) => {
    if (apply && changed) visibility.setHidden(draft);
    setDraft(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close(false))}
    >
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
        // Escape on an open dropdown - the Save as list - closes the list only,
        // rather than the dialog and the draft with it.
        onEscapeKeyDown={(event) => {
          const target = event.target;
          if (
            target instanceof HTMLElement &&
            target.getAttribute("aria-expanded") === "true"
          ) {
            event.preventDefault();
          }
        }}
        ref={contentRef}
      >
        <DiveFormFieldsDialogBody
          visibility={visibility}
          fields={fields}
          presets={presets}
          onApply={() => close(true)}
          onCancel={() => close(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface DiveFormFieldsDialogBodyProps {
  visibility: DiveFormVisibility;
  /** The draft the switches edit - `visibility` itself is only written on close. */
  fields: DiveFormFieldsView;
  presets: DiveFormPresets;
  /** Applies the draft and closes. */
  onApply: () => void;
  /** Drops the draft and closes. */
  onCancel: () => void;
}

// Mounted with `DialogContent`, so the tab and the Save state start over on each open.
function DiveFormFieldsDialogBody({
  visibility,
  fields,
  presets,
  onApply,
  onCancel,
}: DiveFormFieldsDialogBodyProps) {
  const [tab, setTab] = useState("fields");
  const [canSave, setCanSave] = useState(false);
  const saveFormId = useId();

  return (
    <>
      <DialogHeader>
        <DialogTitle>Configure Fields</DialogTitle>
        <DialogDescription>
          Choose what the dive form asks for. Applied changes are saved to your
          account and used for every dive you log.
        </DialogDescription>
      </DialogHeader>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="presets">Presets</TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="space-y-6 pt-4">
          <DiveFormFieldSwitches visibility={fields} />
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
              fields.hidden,
              visibility.selectedPresetUuid,
            )}
            disabled={presets.isWorking}
            formId={saveFormId}
            onSaveableChange={setCanSave}
            // The draft is now that preset's, so it reaches the form and the
            // preset becomes the pick.
            onSave={async (name, existing) => {
              const saved = existing
                ? (await presets.updateHiddenFields(existing, fields.hidden)) &&
                  existing
                : await presets.createPreset(name, fields.hidden);
              if (!saved) return;
              onApply();
              visibility.selectPreset(saved.uuid);
            }}
          />
        </TabsContent>

        <TabsContent value="presets" className="pt-4">
          <DiveFormPresetList presets={presets} />
        </TabsContent>
      </Tabs>

      <FormApiError error={presets.error} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="outline" onClick={onApply}>
          Apply
        </Button>
        {tab === "fields" && (
          <Button type="submit" form={saveFormId} disabled={!canSave}>
            <Save className="h-4 w-4 mr-2" />
            Save preset
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
