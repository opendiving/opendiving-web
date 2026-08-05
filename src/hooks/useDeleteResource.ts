"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";

interface UseDeleteResourceOptions {
  confirmMessage: string;
  successMessage: string;
  errorMessage: string;
  onDeleted: () => void | Promise<void>;
}

// Shared "confirm, delete, toast, refresh" flow used by the dives/trips/sites
// list and detail pages' delete actions. Confirmation is driven by a
// `ConfirmDialog` (see `useDeleteResource`'s `pendingId`/`requestDelete`)
// rather than the blocking native `confirm()`.
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
        description: errorMessage,
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
