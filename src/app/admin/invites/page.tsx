"use client";

import { useCallback, useState } from "react";
import { Mail, Trash2 } from "lucide-react";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { adminAPI, type AdminInviteRequest } from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CountBadge } from "@/components/ui/count-badge";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { useToast } from "@/components/ui/use-toast";
import { InviteRequestsTable } from "@/components/admin/invite-requests-table";
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
 * Selection lives here and is per page: it is cleared when the page changes and
 * after either action, so an address can never be acted on while off screen. It
 * is also what keeps the batch inside the API's cap without this page having to
 * repeat the number - a selection cannot be larger than a page of the queue.
 */
export default function AdminInvitesPage() {
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
    loadMore,
    reload,
  } = useInfiniteResource<AdminInviteRequest>(fetchRequests, {
    // No uuid on an invite request - the address is the identity, on this side
    // and on the API's.
    keyOf: (request) => request.email,
    errorMessage: "Failed to load the invite queue. Please try again.",
  });

  const toggle = (email: string, checked: boolean) =>
    setSelected((current) =>
      checked
        ? [...current, email]
        : current.filter((selected) => selected !== email),
    );

  const toggleAll = (checked: boolean) =>
    setSelected(checked ? requests.map((request) => request.email) : []);

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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Invite Queue</h1>
        <p className="text-muted-foreground mt-2">
          Addresses that have asked for an invitation to this instance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle
            as="h2"
            className="flex items-center justify-between gap-4"
          >
            <span>Requests</span>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="pending request"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <Button
              onClick={() => setPendingAction("invite")}
              disabled={count === 0 || isActing}
            >
              <Mail className="h-4 w-4 mr-2" />
              Send invitations
            </Button>
            <Button
              variant="outline"
              onClick={() => setPendingAction("remove")}
              disabled={count === 0 || isActing}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </Button>
            <span
              className="text-sm text-muted-foreground self-center"
              // Ticking a row is a pointer gesture with no announcement of its
              // own, so the running total is spoken as it changes. The select-all's
              // `indeterminate` dash carries the same news, and a screen reader does
              // read it - a native checkbox exposes the mixed state - but only to
              // someone who goes back to the header box for it. This region is the
              // half that arrives unasked.
              aria-live="polite"
            >
              {count === 0 ? "Nothing selected" : `${addresses} selected`}
            </span>
          </div>

          <InviteRequestsTable
            requests={requests}
            isLoading={isLoading}
            itemsPerPage={itemsPerPage}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
          />

          {/* No selection reset here, unlike the Previous/Next footer this
              replaced: that cleared the ticks because a page turn carried the
              selected addresses off screen, and sending invitations the operator
              can no longer see is the thing it was guarding against. Loading
              more only appends, so everything ticked stays visible. */}
          <LoadMoreTrigger
            hasMore={hasMore}
            isLoading={isLoadingMore}
            loadedCount={requests.length}
            totalCount={totalCount}
            itemsPerPage={itemsPerPage}
            itemLabel="requests"
            onLoadMore={loadMore}
          />
        </CardContent>
      </Card>

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
    </div>
  );
}
