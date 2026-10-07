"use client";

import { useRef } from "react";

import type { PictureKind } from "@/lib/picture";
import type { CheckinGroup } from "@/lib/validations/checkin-details";
import {
  CHECK_IN_GROUP_HEADINGS,
  CheckinDetailsForm,
} from "@/components/checkin/checkin-details-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserFieldsSubmitButton } from "@/components/user/user-fields-form";

export interface CheckinDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: CheckinGroup;
  /** The sheet's About You, which edits the name beside the object's members. */
  withName?: boolean;
  /** The portrait, edited beside the fields and saved with them. */
  picture?: PictureKind;
  savedMessage?: string;
}

/**
 * One check-in group in a dialog: what `/checkin` opens over the summary so a group can
 * be filled in beside the sheet that prints it, and what the bell opens for a policy.
 *
 * No state of its own - `DialogPortal` unmounts the content when the dialog closes,
 * so each open builds a fresh form and seeds it from the shared copy.
 */
export function CheckinDetailsDialog({
  open,
  onOpenChange,
  group,
  withName,
  picture,
  savedMessage,
}: CheckinDetailsDialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const { title, description } = CHECK_IN_GROUP_HEADINGS[group];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={panel}
        // `DatePicker` opens its calendar whenever the box takes focus, so a group
        // whose first field is a date would open with a calendar over the form.
        // Focusing the panel is Radix's own fallback for a dialog with nothing
        // tabbable in it: still announced, still trapping focus.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          panel.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <CheckinDetailsForm
          group={group}
          withName={withName}
          picture={picture}
          savedMessage={savedMessage}
          onSaved={() => onOpenChange(false)}
        >
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <UserFieldsSubmitButton />
          </DialogFooter>
        </CheckinDetailsForm>
      </DialogContent>
    </Dialog>
  );
}
