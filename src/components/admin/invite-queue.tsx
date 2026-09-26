"use client";

import { useCallback, useState } from "react";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { adminAPI, type AdminInviteRequest } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/error";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  InviteQueueFrame,
  MAX_SELECTED,
} from "@/components/admin/invite-queue-frame";
import { summarizeInvitationOutcomes } from "@/components/admin/invitation-outcomes";

type PendingAction = "invite" | "remove";

/**
 * The invite queue: the addresses that have asked for an invitation, and the two
 * things the operator can do with a selection of them.
 *
 * **Nothing here describes the instance's registration policy**, and that is a
 * rule rather than a style. The `/admin/*` routes carry no mode check - an
 * operator who opens registration still has a queue to answer - so this page is
 * reachable, and works, on an instance where anybody may sign up. A line like
 * "registration is by invitation" would be false there. The queue is described
 * by what it holds instead.
 *
 * Selection lives here and is cleared after either action, so an address is
 * never carried into a batch the operator has stopped looking at. It used to be
 * cleared on a page turn too, which is what kept it inside the API's cap without
 * this page having to repeat the number; the queue loads on scroll now and
 * accumulates, so `MAX_SELECTED` states the cap outright.
 */

export function InviteQueue() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [isActing, setIsActing] = useState(false);

  // No dependencies, so the fetch-on-mount effect in `useInfiniteResource` runs
  // once: the admin layout above has already resolved the user, and this page
  // reads nothing off it. See "A shared mock response object hides a render
  // loop" in DECISIONS.md for what a per-render callback would cost here.
  const fetchRequests = useCallback(
    (page: number, perPage: number) =>
      adminAPI.listInviteRequests(page, perPage),
    [],
  );

  const {
    items: requests,
    isLoading,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    reload,
  } = useInfiniteResource<AdminInviteRequest>(fetchRequests, {
    // No uuid on an invite request - the address is the identity, on this side
    // and on the API's.
    keyOf: (request) => request.email,
    errorMessage: "Failed to load the invite queue. Please try again.",
  });

  // Both guards are on the selection itself rather than on the buttons, so the
  // batch is incapable of being too big rather than merely refused when it is.
  // A disabled action over an oversized selection is the worse shape: the
  // failure arrives after the work of ticking, and the only way out is to untick
  // by hand.
  const toggle = (email: string, checked: boolean) =>
    setSelected((current) => {
      if (!checked) return current.filter((selected) => selected !== email);
      return current.length >= MAX_SELECTED ? current : [...current, email];
    });

  // Select-all takes the first `MAX_SELECTED` rows rather than every loaded one.
  // The queue reloads after an action, so acting on a full batch and ticking
  // again is the way through a long queue - which is what the old per-page
  // selection amounted to anyway.
  //
  // **It decides from the selection, not from the checkbox's `checked`.** Once
  // more rows are loaded than a batch can hold, the header box can never render
  // checked - `allSelected` asks whether *every* loaded row is selected, and the
  // cap guarantees it isn't. A native checkbox negates its own checkedness on
  // click and ignores `indeterminate` entirely, so a box rendered unchecked
  // reports `checked === true` every time, and a handler that trusted it would
  // re-select the same hundred forever with no way back to empty but a hundred
  // unticks. Reading the selection instead keeps the control two-way in the one
  // state the cap exists for.
  const toggleAll = () =>
    setSelected((current) =>
      current.length > 0
        ? []
        : requests.slice(0, MAX_SELECTED).map((request) => request.email),
    );

  const runAction = async (action: PendingAction) => {
    setIsActing(true);
    try {
      if (action === "invite") {
        const response = await adminAPI.sendInvitations(selected);
        toast({
          title: "Invitations",
          // Straight from the response. What was selected and what happened are
          // different lists - an address that already has an account is
          // reported, not invited - so a count taken from the selection would
          // state something the API never said.
          description: summarizeInvitationOutcomes(response.results),
        });
      } else {
        const { removed } = await adminAPI.removeInviteRequests(selected);
        toast({
          title: "Queue updated",
          description: `${removed} ${removed === 1 ? "request" : "requests"} removed from the queue.`,
        });
      }
      setSelected([]);
      setPendingAction(null);
      // The whole queue again rather than a row at a time: a batch invites or
      // removes an arbitrary set of rows, and the operator's selection has just
      // been cleared anyway, so there is no scroll position worth preserving.
      await reload();
    } catch (error) {
      // The selection survives, so the operator can retry the same batch
      // without ticking it all again.
      setPendingAction(null);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          action === "invite"
            ? "Failed to send the invitations. Please try again."
            : "Failed to remove the requests. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsActing(false);
    }
  };

  const count = selected.length;
  const addresses = `${count} ${count === 1 ? "address" : "addresses"}`;

  return (
    <>
      <InviteQueueFrame
        isLoading={isLoading}
        totalCount={totalCount}
        itemsPerPage={itemsPerPage}
        requests={requests}
        selected={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
        isActing={isActing}
        onAct={setPendingAction}
        isLoadingMore={isLoadingMore}
        loadFailed={loadFailed}
        hasMore={hasMore}
        onLoadMore={loadMore}
      />

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={
          pendingAction === "remove" ? "Remove from queue" : "Send invitations"
        }
        description={
          pendingAction === "remove"
            ? `Drop ${addresses} from the queue. Nobody is told, and they can ask again.`
            : `Email an invitation to ${addresses}. Each one can then sign in with the address it was sent to.`
        }
        confirmText={pendingAction === "remove" ? "Remove" : "Send"}
        variant={pendingAction === "remove" ? "destructive" : "default"}
        isLoading={isActing}
        onConfirm={() => {
          if (pendingAction) runAction(pendingAction);
        }}
      />
    </>
  );
}
