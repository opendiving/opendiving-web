"use client";

import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button, ButtonProps } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ButtonProps["variant"];
  isLoading?: boolean;
  // Blocks the confirm button while the dialog's own content is incomplete - a
  // chosen option with nothing filled in for it yet. Separate from `isLoading`,
  // which also blocks Cancel and dismissal: an unfinished choice must still be
  // cancellable.
  confirmDisabled?: boolean;
  // Rendered between the description and the buttons, for a confirmation that
  // asks something as well as telling (e.g. what to do with the dives attached
  // to the trip being deleted).
  children?: React.ReactNode;
  onConfirm: () => void | Promise<void>;
}

// Shared confirmation dialog for destructive actions (e.g. deletes), used in
// place of the blocking native `confirm()` so it's stylable and testable.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "destructive",
  isLoading = false,
  confirmDisabled = false,
  children,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isLoading && onOpenChange(next)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {children}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={variant}
            // Wrapped rather than passed straight through: `onConfirm` is
            // declared to take nothing, but several callers pass
            // `useDeleteResource`'s `confirmDelete`, which now takes an optional
            // second argument for the delete. Handing it a click event would put
            // a `MouseEvent` where a uuid goes the day one of those deletes grows
            // a parameter, and the declared type cannot catch it.
            onClick={() => onConfirm()}
            disabled={isLoading || confirmDisabled}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
