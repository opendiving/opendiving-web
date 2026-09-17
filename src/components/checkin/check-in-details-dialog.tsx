"use client";

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
  CheckInDetailsForm,
  CheckInDetailsSubmitButton,
} from "@/components/checkin/check-in-details-form";

// The settings card's form, over the summary that prints it. A diver stood at a desk
// has just been asked for the thing that is missing, and sending them to `/settings`
// and back is two navigations away from the page they are about to hand over.
//
// No state of its own: `DialogPortal` unmounts the content when the dialog closes, so
// each open builds a fresh form and seeds it from the account.
export function CheckInDetailsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check-in details</DialogTitle>
          <DialogDescription>
            Saved to your account, so the next desk gets it without you typing
            it again. Anything left empty stays off your summary.
          </DialogDescription>
        </DialogHeader>

        <CheckInDetailsForm onSaved={() => onOpenChange(false)}>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <CheckInDetailsSubmitButton />
          </DialogFooter>
        </CheckInDetailsForm>
      </DialogContent>
    </Dialog>
  );
}
