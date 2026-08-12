"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api/error";

interface UseDeleteResourceOptions {
  confirmMessage: string;
  successMessage: string;
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
export function useDeleteResource(
  deleteFn: (id: string) => Promise<unknown>,
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

  const confirmDelete = async () => {
    if (!pendingId) return;
    const id = pendingId;
    setPendingId(null);

    try {
      setDeletingId(id);
      await deleteFn(id);

      toast({
        title: "Success",
        description: successMessage,
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
