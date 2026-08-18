"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api/error";

interface UseDeleteResourceOptions<TResult> {
  confirmMessage: string;
  // A function when the toast has something to say about what came back - the
  // trip and dive-site deletes answer with how many dives they moved, and "12
  // dives moved to Cebu 2026" is the half of that sentence the diver acts on.
  // A plain string everywhere else, which is most places.
  //
  // It is handed the id as well as the result, so a caller holding per-delete
  // state can look it up rather than reading whatever the last call left behind.
  // Two deletes can be in flight at once - two rows of a list, each with its own
  // dialog - and the responses need not come back in the order they were sent.
  successMessage: string | ((result: TResult, id: string) => string);
  errorMessage: string;
  onDeleted: () => void | Promise<void>;
}

/**
 * Shared "confirm, delete, toast, refresh" flow used by the dives/trips/sites/gear/
 * certifications list pages *and* the four detail pages' delete actions.
 * Confirmation is driven by a `ConfirmDialog` (via `pendingId`/`requestDelete`)
 * rather than the blocking native `confirm()`.
 *
 * The detail pages used to hand-roll this, and had drifted: only `gear/[id]` ran the
 * failure through `getApiErrorMessage`, so a 409 from the API - "this dive site is
 * used by 3 dives", the one message that tells the diver what to do about it - was
 * replaced by a generic "Please try again." on dives, sites and trips.
 */
export function useDeleteResource<TResult = unknown>(
  // The second argument is for the deletes that take one: `deleteTrip` and
  // `deleteDiveSite` accept the uuid to move the resource's dives onto. A
  // `deleteFn` that only takes an id satisfies this too, which is why the other
  // five call sites are unchanged.
  deleteFn: (id: string, option?: string) => Promise<TResult>,
  {
    confirmMessage,
    successMessage,
    errorMessage,
    onDeleted,
  }: UseDeleteResourceOptions<TResult>,
) {
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const requestDelete = (id: string) => setPendingId(id);
  const cancelDelete = () => setPendingId(null);

  const confirmDelete = async (option?: string) => {
    if (!pendingId) return;
    const id = pendingId;
    setPendingId(null);

    try {
      setDeletingId(id);
      const result = await deleteFn(id, option);

      toast({
        title: "Success",
        description:
          typeof successMessage === "function"
            ? successMessage(result, id)
            : successMessage,
      });

      await onDeleted();
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
