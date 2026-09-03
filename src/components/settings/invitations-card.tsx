"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailPlus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { StatusMessage } from "@/components/ui/status-message";
import { useToast } from "@/components/ui/use-toast";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { getApiErrorMessage } from "@/lib/api/error";
import { invitationsAPI, type Invitation } from "@/lib/api/invitations";
import { formatDateTime } from "@/lib/date-time";
import { cn } from "@/lib/utils";
import {
  emailAuthSchema,
  type EmailAuthFormData,
} from "@/lib/validations/auth";

// What the list request came back with. `absent` is an instance in `open` mode,
// where anyone may register and there is nothing to invite anyone to: the API
// answers 404 and the whole card goes, which is how this card learns the mode
// without ever being told it. Same union, and the same reasoning, as
// `SessionsCard` and `PasskeysCard`.
type ListState =
  | { status: "loading" }
  | {
      status: "ready";
      invitations: Invitation[];
      hasMore: boolean;
      page: number;
    }
  | { status: "absent" }
  | { status: "failed"; message: string };

const LIST_FAILED = "Couldn't load the invitations you have sent.";

// Dates only, like the passkey rows: the hour an invitation was sent says nothing
// its sender needs.
const DAY = { year: "numeric", month: "short", day: "numeric" } as const;

/**
 * The invitations the diver has sent, and the form for sending another.
 *
 * **Every refusal here is the API's sentence, shown verbatim.** There are four -
 * the address already has an account, this account has already invited it, the
 * quota is spent, and the address is malformed - and each carries a message that
 * says what to do about it. Rewording any of them here would put a second copy of
 * a rule this app does not own next to the copy that enforces it.
 *
 * An invitation carries no code and no link the sender could forward: it is an
 * allow-list entry keyed on the address, and the invitee signs in with that
 * address the ordinary way. So there is nothing on a row to copy, and revoking is
 * the only control a pending row needs.
 */
export function InvitationsCard() {
  const { toast } = useToast();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [sendError, setSendError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmailAuthFormData>({
    // The sign-in form's schema. An address is an address, and one definition of
    // "that is not one" is enough for the app.
    resolver: zodResolver(emailAuthSchema),
  });

  // A promise chain rather than `async`/`await`, because it is called from the
  // effect below and `react-hooks/set-state-in-effect` rejects a
  // synchronous-looking setState there - the same shape `SessionsCard.refresh`
  // has, for the same rule.
  const refresh = useCallback(
    () =>
      invitationsAPI
        .listInvitations()
        .then((response) =>
          setList({
            status: "ready",
            invitations: response.data,
            hasMore: response.has_more,
            page: response.page,
          }),
        )
        .catch((error: unknown) => {
          console.error(LIST_FAILED, error);
          const status = (error as { response?: { status?: number } })?.response
            ?.status;
          setList(
            status === 404
              ? { status: "absent" }
              : {
                  status: "failed",
                  message: getApiErrorMessage(error, LIST_FAILED),
                },
          );
        }),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { deletingId, pendingId, requestDelete, cancelDelete, confirmDelete } =
    useDeleteResource((uuid: string) => invitationsAPI.revokeInvitation(uuid), {
      successMessage:
        "That invitation no longer lets the address create an account.",
      errorMessage: "Couldn't revoke that invitation. Please try again.",
      // Re-read rather than stamped in place: `revoked_at` is the server's own
      // clock, and a row that showed a time this browser made up would be a
      // worse answer than one extra request. It costs the older pages a diver
      // had loaded, which is the right trade for an action they take rarely.
      onDeleted: refresh,
    });

  const invitations = list.status === "ready" ? list.invitations : [];
  const pendingInvitation = invitations.find((one) => one.uuid === pendingId);

  const onSend = async (data: EmailAuthFormData) => {
    setSendError(null);
    try {
      const created = await invitationsAPI.sendInvitation(data.email);
      // Prepended from the response rather than re-read: the route answers with
      // the row it created, the list is newest-first, and a second GET here
      // would be a request whose answer this one already contains.
      setList((current) =>
        current.status === "ready"
          ? { ...current, invitations: [created, ...current.invitations] }
          : current,
      );
      reset();
      toast({
        title: "Success",
        description: `${created.email} can now create an account here.`,
      });
    } catch (error) {
      console.error("Couldn't send that invitation.", error);
      setSendError(
        getApiErrorMessage(
          error,
          "Couldn't send that invitation. Please try again.",
        ),
      );
    }
  };

  const loadMore = async () => {
    if (list.status !== "ready") return;
    try {
      setIsLoadingMore(true);
      const response = await invitationsAPI.listInvitations(list.page + 1);
      setList((current) => {
        if (current.status !== "ready") return current;
        // Deduped by uuid, and this is load-bearing rather than belt-and-braces.
        // The route pages by offset over a newest-first ordering, so any row
        // added since the first page was read shifts every later row down one -
        // and a send does exactly that, prepending its created row without
        // asking the server for a new page number. Page 2 would then start on
        // the row that was the last of page 1 and append a second copy of it,
        // duplicating a React key. Filtering on identity fixes the whole class,
        // not just the send: an invitation created in another tab, or from the
        // admin queue, shifts the window the same way, and no page number this
        // card could track would know about those.
        //
        // `fetchAllPages` in `lib/api/client.ts` carries the same `keyOf` dedup
        // for the same reason, and its comment records the half neither of us
        // can fix: a row pushed *out* of an already-read page leaves a gap.
        // Nothing here removes rows - a revoke stamps rather than deletes, and
        // re-reads anyway - so only the duplicate half can arise.
        const known = new Set(current.invitations.map((one) => one.uuid));
        return {
          ...current,
          invitations: [
            ...current.invitations,
            ...response.data.filter((one) => !known.has(one.uuid)),
          ],
          hasMore: response.has_more,
          page: response.page,
        };
      });
    } catch (error) {
      console.error("Couldn't load older invitations.", error);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Couldn't load older invitations. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (list.status === "absent") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <MailPlus className="h-5 w-5" />
          Invitations
        </CardTitle>
        <CardDescription>
          New accounts on this instance are by invitation. Invite someone and
          they can sign in with that address to create their own account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSend)} className="space-y-3">
          {sendError && (
            <StatusMessage variant="error">{sendError}</StatusMessage>
          )}

          <div className="space-y-2">
            <Label htmlFor="invitation-email">Email</Label>
            <div className="flex flex-wrap items-start gap-3">
              <Input
                id="invitation-email"
                type="email"
                placeholder="buddy@example.com"
                autoComplete="off"
                className={cn(
                  "min-w-0 flex-1",
                  errors.email && "border-destructive",
                )}
                {...register("email")}
              />
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <div className="flex items-center space-x-2">
                    <ButtonSpinner />
                    <span>Sending...</span>
                  </div>
                ) : (
                  <span>Send invitation</span>
                )}
              </Button>
            </div>
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
        </form>

        {list.status === "loading" && <SectionSpinner />}

        {list.status === "failed" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{list.message}</p>
            <Button variant="outline" size="sm" onClick={() => refresh()}>
              Try again
            </Button>
          </div>
        )}

        {list.status === "ready" && invitations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            You have not invited anyone yet.
          </p>
        )}

        {invitations.map((invitation) => (
          <div
            key={invitation.uuid}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium break-all">
                  {invitation.email}
                </span>
                {invitation.accepted_at ? (
                  <Badge variant="teal">
                    Accepted {formatDateTime(invitation.accepted_at, DAY)}
                  </Badge>
                ) : invitation.revoked_at ? (
                  <Badge variant="secondary">Revoked</Badge>
                ) : (
                  <Badge variant="outline">Pending</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Invited {formatDateTime(invitation.created_at, DAY)}
              </p>
            </div>
            {/* Only on a row that could still be used. An accepted invitation
                cannot be taken back - the account exists - and the API refuses
                it with a 409; a revoked one is already revoked. */}
            {!invitation.accepted_at && !invitation.revoked_at && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Revoke the invitation to ${invitation.email}`}
                disabled={deletingId === invitation.uuid}
                onClick={() => requestDelete(invitation.uuid)}
              >
                {deletingId === invitation.uuid ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        ))}

        {list.status === "ready" && list.hasMore && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={isLoadingMore}
            onClick={() => void loadMore()}
          >
            {isLoadingMore ? (
              <div className="flex items-center space-x-2">
                <ButtonSpinner />
                <span>Loading...</span>
              </div>
            ) : (
              <span>Show older invitations</span>
            )}
          </Button>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && cancelDelete()}
        title="Revoke this invitation"
        description={
          pendingInvitation
            ? `${pendingInvitation.email} will no longer be able to create an account here. The row stays in this list as revoked, and you can invite the address again later.`
            : undefined
        }
        confirmText="Revoke"
        isLoading={deletingId === pendingId}
        onConfirm={confirmDelete}
      />
    </Card>
  );
}
