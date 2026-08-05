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
// list and detail pages' delete actions.
export function useDeleteResource(
  deleteFn: (id: string) => Promise<unknown>,
  { confirmMessage, successMessage, errorMessage, onDeleted }: UseDeleteResourceOptions,
) {
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm(confirmMessage)) return;

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

  return { deletingId, handleDelete };
}
