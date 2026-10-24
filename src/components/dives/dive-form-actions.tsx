"use client";

import { useRef } from "react";
import Link from "next/link";
import { Check, FilePen, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { FormApiError } from "@/components/ui/form-api-error";
import { useStuckAtEdge } from "@/hooks/useStuckAtEdge";
import { useShortViewport } from "@/hooks/useVisualViewport";

export interface DiveFormActionsProps {
  cancelHref: string;
  // Picks the submit icon, matching the rest of the app: a plus creates,
  // a floppy saves an existing record.
  mode: "create" | "edit";
  isSubmitting: boolean;
  submittingLabel: string;
  submitLabel: string;
  // Set while a field is still finishing something the save would otherwise
  // race - today, the species picker turning a pick into a catalog row. Kept
  // apart from `isSubmitting` because the save has not started: the button says
  // what it is waiting for rather than claiming to be saving.
  isBusy?: boolean;
  busyLabel?: string;
  // The form-level refusal, shown above the buttons wherever the row is - pinned
  // to the foot of the screen or in its place at the end of the form.
  error?: string | null;
  // The create form's draft buttons - see `DiveFormDraftActions`.
  draft?: DiveFormDraftActions;
}

/**
 * *Save as draft* and, once the form saves into a draft, *Discard draft*. A save
 * is a plain button rather than a submit: a draft is unfinished by definition, so
 * nothing validates it.
 */
export interface DiveFormDraftActions {
  onSave: () => void;
  // "saved" for a moment after each save lands.
  status: "idle" | "saving" | "saved";
  // Present while the form saves into a draft.
  onDiscard?: () => void;
}

// Shared "Cancel" / "Save" button row used by both the create and edit dive forms.
// `globals.css` sticks it to the foot of the screen while the form runs on below
// it, and gives it a surface only while it is stuck there. It settles at the
// form's end, and stays there while the keyboard is up.
export function DiveFormActions({
  cancelHref,
  mode,
  isSubmitting,
  submittingLabel,
  submitLabel,
  isBusy = false,
  busyLabel,
  error = null,
  draft,
}: DiveFormActionsProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  // Stuck, the row's bottom edge is the viewport's.
  const stuck = useStuckAtEdge(rowRef, {
    edge: "bottom",
    rootMargin: "0px 0px -1px 0px",
  });
  useShortViewport();

  const SubmitIcon = mode === "create" ? Plus : Save;
  // A disabled submit button is also what stops implicit submission (Enter in a
  // text field), which is the other way a save could outrun a pending resolve.
  const waiting = isSubmitting || isBusy;
  const waitingLabel = isSubmitting ? submittingLabel : busyLabel;
  return (
    // `data-stuck` is what `globals.css` keys the surface and the page's bottom
    // scroll padding on.
    <div
      ref={rowRef}
      data-dive-form-actions=""
      data-stuck={stuck ? "" : undefined}
      className="z-20 space-y-2 pt-3"
    >
      <FormApiError error={error} />
      <div className="flex flex-wrap justify-end gap-4 max-sm:gap-2">
        <Button type="button" variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        {draft?.onDiscard && (
          <Button
            type="button"
            variant="ghost"
            onClick={draft.onDiscard}
            disabled={waiting || draft.status === "saving"}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Discard draft
          </Button>
        )}
        {draft && (
          <Button
            type="button"
            variant="outline"
            onClick={draft.onSave}
            disabled={waiting || draft.status === "saving"}
          >
            {draft.status === "saving" ? (
              <ButtonSpinner className="mr-2" />
            ) : draft.status === "saved" ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <FilePen className="h-4 w-4 mr-2" />
            )}
            {draft.status === "saved" ? "Saved" : "Save as draft"}
          </Button>
        )}
        <Button type="submit" disabled={waiting}>
          {waiting && waitingLabel ? (
            <>
              <ButtonSpinner className="mr-2" />
              {waitingLabel}
            </>
          ) : (
            <>
              <SubmitIcon className="h-4 w-4 mr-2" />
              {submitLabel}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
