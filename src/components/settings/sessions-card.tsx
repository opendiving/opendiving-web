"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, LogOut, MonitorSmartphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { useToast } from "@/components/ui/use-toast";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { getApiErrorMessage } from "@/lib/api/error";
import { sessionsAPI, type UserSession } from "@/lib/api/sessions";
import { formatDateTime } from "@/lib/date-time";
import { deviceNameForUserAgent } from "@/lib/passkey-name";

// What the list request came back with. `absent` is the instance whose API
// predates server-side sessions and 404s: that is not an error to report on a
// settings page, it is a feature this copy of OpenDiving does not have, so the
// whole card goes. Same union, and the same reasoning, as `PasskeysCard`.
type ListState =
  | { status: "loading" }
  | { status: "ready"; sessions: UserSession[] }
  | { status: "absent" }
  | { status: "failed"; message: string };

const LIST_FAILED = "Couldn't load your signed-in devices.";

/**
 * The devices signed in to the account: what each one looks like, where it signed
 * in from, when it was last used, and the two ways to end one.
 *
 * **The row you are reading this on is marked and carries no revoke control.**
 * Ending your own session is what signing out is - it has to clear the refresh
 * cookie and spend the token pair as well as mark the row - so a revoke button
 * here would be a worse logout than the one already in the menu. The API answers
 * 409 for it, but that is a backstop rather than the design.
 *
 * Revoking takes hold at once. The API resolves the session behind an access
 * token on every authenticated request, so a revoked device is refused on its
 * next call rather than for as long as the token it is already holding lasts -
 * which is why both dialogs here say "immediately" flatly instead of hedging
 * around an access-token lifetime this repo cannot see.
 */
export function SessionsCard() {
  const { toast } = useToast();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [confirmingOthers, setConfirmingOthers] = useState(false);
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);

  // A promise chain rather than `async`/`await`, because it is called from the
  // effect below and `react-hooks/set-state-in-effect` rejects a
  // synchronous-looking setState there - the same shape `PasskeysCard.refresh`
  // has, for the same rule.
  const refresh = useCallback(
    () =>
      sessionsAPI
        .listSessions()
        .then((sessions) => setList({ status: "ready", sessions }))
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
    useDeleteResource((uuid: string) => sessionsAPI.revokeSession(uuid), {
      successMessage: "That device has been signed out of your account.",
      errorMessage: "Couldn't sign that device out. Please try again.",
      onDeleted: refresh,
    });

  const sessions = list.status === "ready" ? list.sessions : [];
  const pendingSession = sessions.find((one) => one.uuid === pendingId);
  // The button is offered against what is actually there rather than against a
  // count: this asks the question the button answers - is there another device -
  // where `sessions.length > 1` only approximates it from the row count.
  const hasOthers = sessions.some((one) => !one.current);

  const revokeOthers = async () => {
    setConfirmingOthers(false);
    try {
      setIsRevokingOthers(true);
      const { revoked } = await sessionsAPI.revokeOtherSessions();
      toast({
        title: "Success",
        // The count comes from the response and can come from nowhere else: the
        // confirmation fires before the request, so the dialog never knew it.
        description:
          revoked === 1
            ? "1 other device was signed out."
            : `${revoked} other devices were signed out.`,
      });
      await refresh();
    } catch (error) {
      console.error("Couldn't sign the other devices out.", error);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Couldn't sign the other devices out. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsRevokingOthers(false);
    }
  };

  if (list.status === "absent") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle
          as="h2"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2">
            <MonitorSmartphone className="h-5 w-5" />
            Signed-in devices
          </span>
          {hasOthers && (
            <Button
              variant="outline"
              size="sm"
              disabled={isRevokingOthers}
              onClick={() => setConfirmingOthers(true)}
            >
              {isRevokingOthers ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4 mr-2" />
              )}
              Sign out other sessions
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          Every browser and app currently signed in to your account. Sign one
          out if you do not recognise it, or if you left yourself signed in
          somewhere.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.status === "loading" && <SectionSpinner />}

        {list.status === "failed" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{list.message}</p>
            <Button variant="outline" size="sm" onClick={() => refresh()}>
              Try again
            </Button>
          </div>
        )}

        {list.status === "ready" && sessions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing is signed in right now, including this browser. It will be
            signed out the next time it checks in.
          </p>
        )}

        {sessions.map((session) => {
          const device = deviceNameForUserAgent(session.user_agent);

          return (
            <div
              key={session.uuid}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium break-words">{device}</span>
                  {session.current && (
                    <Badge variant="secondary">This device</Badge>
                  )}
                </div>
                {/* With the time of day, unlike a passkey's added-date. The hour
                    a session was last used is the whole question for a diver
                    deciding whether they recognise it - "last night at 02:14"
                    means something a bare date does not. */}
                <p className="text-xs text-muted-foreground">
                  {session.ip} · Last used{" "}
                  {formatDateTime(session.last_used_at)}
                </p>
              </div>
              {/* Nothing at all for the current row, rather than a disabled
                  button: signing this browser out is what the Sign out menu
                  item does, and a greyed-out control here would read as a
                  broken one. */}
              {!session.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Sign out ${device}`}
                  disabled={deletingId === session.uuid}
                  onClick={() => requestDelete(session.uuid)}
                >
                  {deletingId === session.uuid ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && cancelDelete()}
        title="Sign this device out"
        description={
          pendingSession
            ? `${deviceNameForUserAgent(pendingSession.user_agent)} (${pendingSession.ip}) will have to sign in again. It loses access immediately, on its very next request.`
            : undefined
        }
        confirmText="Sign out"
        isLoading={deletingId === pendingId}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={confirmingOthers}
        onOpenChange={(open) => !isRevokingOthers && setConfirmingOthers(open)}
        title="Sign out other sessions"
        description="Every other browser and app will have to sign in again. This one stays signed in. Each of them loses access immediately, on its very next request."
        confirmText="Sign them out"
        isLoading={isRevokingOthers}
        onConfirm={() => void revokeOthers()}
      />
    </Card>
  );
}
