"use client";

import { useRef } from "react";
import Link from "next/link";
import { Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      className="z-20 space-y-2 py-3"
    >
      <FormApiError error={error} />
      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={waiting}>
          {waiting && waitingLabel ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
