"use client";

import { useEffect, useState } from "react";

/**
 * A create/edit dialog's "the API said no" message, cleared every time the dialog
 * opens, and the `onOpenChange` to hand the dialog's `Dialog` and Cancel button.
 *
 * Owning the state here leaves each dialog's reset-on-open effect doing nothing but
 * `reset(...)`, which `react-hooks/set-state-in-effect` has no quarrel with, so the
 * disable below exists once instead of once per dialog.
 *
 * Clearing on open is what matters: a dialog reopened after a failed save must not
 * greet the diver with the previous attempt's error. The returned `onOpenChange`
 * also clears it when the diver dismisses the dialog; a dialog closed by its parent
 * after a save keeps the message until it is gone from the screen.
 */
export function useDialogApiError(
  open: boolean,
  onOpenChange: (open: boolean) => void,
) {
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // The one legitimate instance of the pattern: this synchronises a piece of
    // state to an external prop flipping, which is exactly the case the rule's own
    // escape hatch is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiError(null);
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setApiError(null);
    onOpenChange(next);
  };

  return [apiError, setApiError, handleOpenChange] as const;
}
