"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api/error";

interface UseDeleteResourceOptions {
  // Omitted by the two callers whose confirmation dialog owns its own copy -
  // `DeleteWithReassignDialog` states the consequence of deleting a trip or a
  // dive site, which is kind-specific and lives with the rest of that wording.
  confirmMessage?: string;
  // What the toast says. A caller with something to add for one particular
  // delete passes it to `confirmDelete` instead - see `successOverride`.
  successMessage: string;
  errorMessage: string;
  // Handed the id that was deleted, so a list can drop that one row instead of
  // re-reading the pages around it. Callers with nothing to do with it - the
  // detail pages, which navigate away - simply take no argument.
  onDeleted: (id: string) => void | Promise<void>;
}

/**
 * Shared "confirm, delete, toast, refresh" flow behind the deletes across the app -
 * the list pages, the detail pages' delete actions, and the delete controls in
 * settings. Confirmation is driven by a `ConfirmDialog` (via
 * `pendingId`/`requestDelete`) rather than the blocking native `confirm()`.
 *
 * The detail pages used to hand-roll this, and had drifted: only `gear/[id]` ran the
 * failure through `getApiErrorMessage`, so a 409 from the API - "this dive site is
 * used by 3 dives", the one message that tells the diver what to do about it - was
 * replaced by a generic "Please try again." on dives, sites and trips.
 */
export function useDeleteResource(
  // The second argument is for the deletes that take one: `deleteTrip` and
  // `deleteDiveSite` accept the uuid to move the resource's dives onto. A
  // `deleteFn` that only takes an id satisfies this too, which is why the call
  // sites whose delete takes nothing but an id are unchanged.
  deleteFn: (id: string, option?: string) => Promise<unknown>,
  {
    confirmMessage,
    successMessage,
    errorMessage,
    onDeleted,
  }: UseDeleteResourceOptions,
) {
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const requestDelete = (id: string) => setPendingId(id);
  const cancelDelete = () => setPendingId(null);

  // `successOverride` replaces `successMessage` for this one call, for a toast
  // that can only be written where the delete is confirmed: the trip and
  // dive-site deletes can name where the dives went, and that name comes from
  // the dialog's picker rather than from anything the API answers with.
  const confirmDelete = async (option?: string, successOverride?: string) => {
    if (!pendingId) return;
    const id = pendingId;
    setPendingId(null);

    try {
      setDeletingId(id);
      await deleteFn(id, option);

      toast({
        title: "Success",
        description: successOverride ?? successMessage,
      });

      await onDeleted(id);
    } catch (error) {
      console.error(errorMessage, error);
      toast({
        title: "Error",
        // The API's own wording where it has one. A delete that is refused is
        // almost always refused *for a reason* the diver can act on, and
        // `errorMessage` can only ever say "please try again" - which is exactly
        // the wrong advice when retrying will fail identically.
        description: getApiErrorMessage(error, errorMessage),
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return {
    deletingId,
    pendingId,
    confirmMessage,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
