"use client";

import Link from "next/link";
import { Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

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
}

// Shared "Cancel" / "Save" button row used by both the create and edit dive forms.
export function DiveFormActions({
  cancelHref,
  mode,
  isSubmitting,
  submittingLabel,
  submitLabel,
  isBusy = false,
  busyLabel,
}: DiveFormActionsProps) {
  const SubmitIcon = mode === "create" ? Plus : Save;
  // A disabled submit button is also what stops implicit submission (Enter in a
  // text field), which is the other way a save could outrun a pending resolve.
  const waiting = isSubmitting || isBusy;
  const waitingLabel = isSubmitting ? submittingLabel : busyLabel;
  return (
    <div className="flex justify-end gap-4 pt-4">
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
  );
}
