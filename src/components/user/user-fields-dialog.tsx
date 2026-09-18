"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  UserFieldsForm,
  UserFieldsSubmitButton,
  type UserFieldGroup,
} from "@/components/user/user-fields-form";

export interface UserFieldsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  groups: UserFieldGroup[];
  savedMessage?: string;
}

/**
 * `UserFieldsForm` in a dialog: what `/checkin` opens over the summary so a group can
 * be filled in beside the sheet that prints it.
 *
 * No state of its own - `DialogPortal` unmounts the content when the dialog closes,
 * so each open builds a fresh form and seeds it from the account.
 */
export function UserFieldsDialog({
  open,
  onOpenChange,
  title,
  description,
  groups,
  savedMessage,
}: UserFieldsDialogProps) {
  const panel = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={panel}
        // `DatePicker` opens its calendar whenever the box takes focus, so a group
        // whose first field is a date would open this dialog with a calendar over the
        // form - Radix focuses the first tabbable child. Focusing the panel instead is
        // Radix's own fallback for a dialog with nothing tabbable in it: the dialog is
        // still announced and still traps focus, and Tab reaches the first box the way
        // a click does. Done here rather than per caller, because which field leads is
        // the caller's choice and this must not depend on it.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          panel.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <UserFieldsForm
          groups={groups}
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
        </UserFieldsForm>
      </DialogContent>
    </Dialog>
  );
}
