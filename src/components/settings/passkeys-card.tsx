"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { useToast } from "@/components/ui/use-toast";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { usePasskeyRegistration } from "@/hooks/usePasskeyRegistration";
import { getApiErrorMessage } from "@/lib/api/error";
import { passkeysAPI, type Passkey } from "@/lib/api/passkeys";
import { PASSKEY_NAME_MAX_LENGTH } from "@/lib/passkey-name";
import { formatDateTime } from "@/lib/date-time";

// What the list request came back with. `absent` is the instance whose API
// predates passkeys and 404s: that is not an error to report on a settings page,
// it is a feature this copy of OpenDiving does not have, so the whole card goes.
type ListState =
  | { status: "loading" }
  | { status: "ready"; passkeys: Passkey[] }
  | { status: "absent" }
  | { status: "failed"; message: string };

interface EditedName {
  uuid: string;
  name: string;
}

const LIST_FAILED = "Couldn't load your passkeys.";

// Dates only - the hour a passkey was added says nothing a diver deciding
// whether to revoke it needs.
const DAY = { year: "numeric", month: "short", day: "numeric" } as const;

/**
 * The passkeys on the account: what they are called, when each was added and last
 * used, and the two things a diver can do about one - rename it or revoke it.
 *
 * Adding is here as well, because this is where someone who *went looking* for
 * passkeys arrives; the dashboard nudge is for everyone who didn't.
 *
 * The card hides itself when there is nothing it could do: an API without the
 * routes, or a browser with no WebAuthn *and* no passkeys registered elsewhere.
 * Note the second half of that - the list is not gated on the browser's
 * capability, only the Add button is. A diver whose passkeys live on their phone
 * must still be able to revoke one from a laptop that cannot create any, and a
 * passkey nobody can see is a passkey nobody can revoke.
 */
export function PasskeysCard() {
  const { toast } = useToast();
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [edited, setEdited] = useState<EditedName | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  // Written as a promise chain rather than `async`/`await` because it is called
  // from the effect below, and `react-hooks/set-state-in-effect` rejects a
  // synchronous-looking setState there - a `.then` callback is exactly the
  // "subscribe to an external system" shape the rule is asking for.
  const refresh = useCallback(
    () =>
      passkeysAPI
        .getPasskeys()
        .then((passkeys) => setList({ status: "ready", passkeys }))
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

  const registration = usePasskeyRegistration({
    onRegistered: useCallback(
      async (passkey: Passkey) => {
        await refresh();
        toast({
          title: "Passkey added",
          description: `You can now sign in with "${passkey.name}". Rename it here if that isn't what you'd call it.`,
        });
      },
      [refresh, toast],
    ),
    onError: useCallback(
      (message: string) =>
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        }),
      [toast],
    ),
  });

  const { deletingId, pendingId, requestDelete, cancelDelete, confirmDelete } =
    useDeleteResource((uuid: string) => passkeysAPI.deletePasskey(uuid), {
      successMessage: "That passkey can no longer sign in to your account.",
      errorMessage: "Couldn't remove that passkey. Please try again.",
      onDeleted: refresh,
    });

  const passkeys = list.status === "ready" ? list.passkeys : [];
  const pendingName = passkeys.find((one) => one.uuid === pendingId)?.name;

  const saveName = async () => {
    if (!edited) return;
    const name = edited.name.trim();
    const previous = passkeys.find((one) => one.uuid === edited.uuid);

    // Nothing to send for an unchanged name, and an empty one is a 422 rather
    // than a delete - the field simply closes and keeps what was there.
    if (!name || name === previous?.name) {
      setEdited(null);
      return;
    }

    try {
      setIsRenaming(true);
      await passkeysAPI.renamePasskey(edited.uuid, name);
      // Patched in place rather than re-read: the rename is the only thing that
      // changed, and a refetch would blank the list for a beat to learn nothing.
      setList((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              passkeys: current.passkeys.map((one) =>
                one.uuid === edited.uuid ? { ...one, name } : one,
              ),
            }
          : current,
      );
      setEdited(null);
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Couldn't rename that passkey. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsRenaming(false);
    }
  };

  if (list.status === "absent") return null;
  // Nothing to manage and nothing this browser could add - so nothing worth a
  // card explaining that. The diver meets passkeys on a browser that has them.
  if (!registration.supported && list.status === "ready" && !passkeys.length) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Passkeys
          </span>
          {registration.supported && (
            <Button
              variant="outline"
              size="sm"
              onClick={registration.register}
              disabled={registration.isRegistering}
            >
              {registration.isRegistering ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add passkey
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          Sign in with your fingerprint, face or device PIN instead of waiting
          for an email. Your email link keeps working either way.
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

        {list.status === "ready" && passkeys.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No passkeys yet. Adding one here means this device can sign you in
            with a single tap.
          </p>
        )}

        {passkeys.map((passkey) => (
          <div
            key={passkey.uuid}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            {edited?.uuid === passkey.uuid ? (
              <>
                <Input
                  autoFocus
                  aria-label="Passkey name"
                  className="min-w-0 flex-1"
                  maxLength={PASSKEY_NAME_MAX_LENGTH}
                  value={edited.name}
                  disabled={isRenaming}
                  onChange={(event) =>
                    setEdited({ uuid: passkey.uuid, name: event.target.value })
                  }
                  // The row is not a form of its own - it sits inside a card, not
                  // a `<form>` - so Enter has to be wired by hand, and Escape with
                  // it so leaving the field never needs the mouse.
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void saveName();
                    }
                    if (event.key === "Escape") setEdited(null);
                  }}
                />
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Save name"
                    disabled={isRenaming}
                    onClick={() => void saveName()}
                  >
                    {isRenaming ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Cancel rename"
                    disabled={isRenaming}
                    onClick={() => setEdited(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium break-words">
                      {passkey.name}
                    </span>
                    {/* The authenticator's own backup flag, refreshed on every
                        use: a synced passkey survives a lost phone, and one
                        without this badge does not. Worth saying plainly, since
                        it is the difference between a spare key and a single
                        copy. */}
                    {passkey.backed_up && (
                      <Badge variant="secondary">Synced</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Added {formatDateTime(passkey.created_at, DAY)} ·{" "}
                    {passkey.last_used_at
                      ? `Last used ${formatDateTime(passkey.last_used_at, DAY)}`
                      : "Never used"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Rename ${passkey.name}`}
                    onClick={() =>
                      setEdited({ uuid: passkey.uuid, name: passkey.name })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${passkey.name}`}
                    disabled={deletingId === passkey.uuid}
                    onClick={() => requestDelete(passkey.uuid)}
                  >
                    {deletingId === passkey.uuid ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}

        {passkeys.length > 0 && !registration.supported && (
          <p className="text-xs text-muted-foreground">
            This browser can&apos;t create passkeys, so there is nothing to add
            here - the ones above still sign you in wherever they live.
          </p>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && cancelDelete()}
        title="Remove passkey"
        description={
          pendingName
            ? `"${pendingName}" will stop signing you in, and can't be brought back - a replacement means going through the prompt again. Your device or password manager keeps its own copy until you delete it there too.`
            : undefined
        }
        confirmText="Remove"
        isLoading={deletingId === pendingId}
        onConfirm={confirmDelete}
      />
    </Card>
  );
}
