"use client";

import { useRef } from "react";
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
  // A third button offering the gentler thing the description points at - the
  // gear delete dialog's "Archive instead". It sits between Cancel and confirm
  // because it is neither: leaving the dialog by it is a deliberate action, not
  // a way out of one. Blocked by `isLoading` alongside Cancel, since the
  // destructive request it diverts from is already gone.
  secondaryAction?: { label: string; onClick: () => void };
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
  secondaryAction,
  onConfirm,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isLoading && onOpenChange(next)}
    >
      <DialogContent
        // Focus goes to Cancel, not to whatever the `children` slot happens to
        // render first. Radix focuses the first tabbable descendant on open,
        // which for a dialog carrying a field means the field - and a
        // `CreatableCombobox` opens its menu on focus, so every trip and dive
        // site delete confirmation opened with a list of options painted over
        // this footer (the menu is absolutely positioned, so it does not push
        // the buttons down; it covers them). A click aimed at Delete landed on
        // an option instead, quietly filling in a destination the diver never
        // chose. It also fired a search on every confirmation, including the
        // plain deletes that never needed one.
        //
        // Cancel is where focus went before this dialog grew a field, and it is
        // the right default for a destructive confirmation anyway: Enter should
        // not be the destructive key.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {children}

        {/* The footer takes no focus, and that is load-bearing rather than
            cosmetic. A dialog whose `children` hold a field can have its
            confirm button *disabled by what is in that field* - the delete
            picker's half-typed destination is the live case - and a pointer
            press does two things: it moves focus, and it activates. A
            disabled button gets `pointer-events: none`, so the press lands on
            this container instead, blurs the field, and the field's blur can
            clear whatever was disabling the button; `disabled` is re-read at
            each event's own dispatch, so the *same gesture* then delivers a
            click to a button that was blocked when it started. Preventing the
            default here stops the focus change, so a press can never quietly
            re-qualify itself. Clicks are unaffected - only focus and text
            selection are. Same reason `CreatableCombobox` does this on its own
            menu rows. */}
        <DialogFooter onMouseDown={(event) => event.preventDefault()}>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          {secondaryAction && (
            <Button
              type="button"
              variant="outline"
              onClick={() => secondaryAction.onClick()}
              disabled={isLoading}
            >
              {secondaryAction.label}
            </Button>
          )}
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
