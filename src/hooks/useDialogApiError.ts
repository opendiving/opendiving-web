"use client";

import { useEffect, useState } from "react";

/**
 * A create/edit dialog's "the API said no" message, cleared every time the dialog
 * opens.
 *
 * All seven of these dialogs (`TripDialog`, `DiveSiteDialog`, `GearItemDialog`,
 * `GearSetDialog`, `CertificationDialog`, `GearServiceScheduleDialog`,
 * `GearServiceRecordDialog`) kept their own `apiError` state and their own
 * `setApiError(null)` inside the effect that resets the form - each carrying its own
 * copy of the `react-hooks/set-state-in-effect` disable below. Owning the state here
 * leaves those effects doing nothing but `reset(...)`, which the rule has no quarrel
 * with, so the disable exists once instead of seven times.
 *
 * Clearing on open rather than on close is what matters: a dialog reopened after a
 * failed save must not greet the diver with the previous attempt's error. Dialogs
 * that also want it gone the moment they close still call the setter themselves.
 */
export function useDialogApiError(open: boolean) {
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // The one legitimate instance of the pattern: this synchronises a piece of
    // state to an external prop flipping, which is exactly the case the rule's own
    // escape hatch is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiError(null);
  }, [open]);

  return [apiError, setApiError] as const;
}
