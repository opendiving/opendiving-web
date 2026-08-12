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
}

// Shared "Cancel" / "Save" button row used by both the create and edit dive forms.
export function DiveFormActions({
  cancelHref,
  mode,
  isSubmitting,
  submittingLabel,
  submitLabel,
}: DiveFormActionsProps) {
  const SubmitIcon = mode === "create" ? Plus : Save;
  return (
    <div className="flex justify-end gap-4 pt-4">
      <Button type="button" variant="outline" asChild>
        <Link href={cancelHref}>Cancel</Link>
      </Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {submittingLabel}
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
