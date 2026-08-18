"use client";

import { useRef } from "react";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import type { DeletedWithMovedDives } from "@/lib/api/client";

/** "1 dive" / "12 dives", for the counts this flow puts in front of the diver. */
export const diveCount = (count: number) =>
  `${count} dive${count === 1 ? "" : "s"}`;

interface UseDeleteWithReassignOptions {
  confirmMessage: string;
  // What the toast says for a plain delete. A move appends to it rather than
  // replacing it - the delete is still the thing that happened.
  successMessage: string;
  errorMessage: string;
  onDeleted: () => void | Promise<void>;
}

/**
 * `useDeleteResource` for the two deletes that can take their dives with them.
 *
 * Exists for one reason: the toast wants to name the replacement ("12 dives moved
 * to Cebu 2026"), and the two halves of that sentence come from different places.
 * The count is in the API's response, which only `useDeleteResource` sees; the
 * name is in the dialog's picker, which only the diver's click sees. This holds
 * the name across the round trip so the four pages don't each keep their own ref.
 *
 * The count is never inferred - `moved_dives` reports what *this call* moved, so a
 * retry after a lost response says 0, and the message correctly degrades to the
 * plain "deleted" wording rather than claiming a move that this call didn't make.
 */
export function useDeleteWithReassign(
  deleteFn: (
    id: string,
    moveDivesTo?: string,
  ) => Promise<DeletedWithMovedDives>,
  {
    confirmMessage,
    successMessage,
    errorMessage,
    onDeleted,
  }: UseDeleteWithReassignOptions,
) {
  // Keyed by the id being deleted rather than held as a single value: two rows of
  // a list can be deleted at once, each from its own dialog, and their responses
  // need not come back in order. A bare ref would let the slower one's toast name
  // the faster one's destination.
  const replacementNames = useRef<Map<string, string>>(new Map());

  const del = useDeleteResource<DeletedWithMovedDives>(deleteFn, {
    confirmMessage,
    errorMessage,
    onDeleted,
    successMessage: (result, id) => {
      const name = replacementNames.current.get(id);
      return result.moved_dives > 0 && name
        ? `${successMessage} ${diveCount(result.moved_dives)} moved to ${name}.`
        : successMessage;
    },
  });

  const confirmDelete = async (moveDivesTo?: string, name?: string) => {
    // `pendingId` is what the delete will run against, and it is cleared inside
    // `confirmDelete` - so the name has to be read and filed under it first.
    const id = del.pendingId;
    if (name && id) replacementNames.current.set(id, name);

    try {
      return await del.confirmDelete(moveDivesTo);
    } finally {
      // Cleared here rather than where it is read, so a *failed* delete drops its
      // entry too. Nothing would misread a leftover - the toast only consults it
      // when the API says dives moved, which needs a fresh `move_dives_to` that
      // overwrites it - but a map the rest of the code treats as short-lived
      // should not quietly be the one thing that grows for the life of the page.
      if (id) replacementNames.current.delete(id);
    }
  };

  return { ...del, confirmDelete };
}
