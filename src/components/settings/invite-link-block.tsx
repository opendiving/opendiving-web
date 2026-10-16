"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Copy, Link2, RotateCcw, Share2, Trash2 } from "lucide-react";

import { QrCode } from "@/components/checkin/qr-code";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getApiErrorMessage } from "@/lib/api/error";
import { invitationsAPI } from "@/lib/api/invitations";

type LinkState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "live"; token: string }
  | { status: "failed"; message: string };

const LOAD_FAILED = "Couldn't load your invite link.";

/** The address a member's invite link opens, on whichever origin this copy runs. */
function inviteLinkUrl(token: string): string {
  return `${window.location.origin}/join?via=${token}`;
}

// Whether this browser has a share sheet: Safari, Chrome and Edge do, Firefox on a
// desktop does not. Read through `useSyncExternalStore` so the server render and
// the first client render agree on "no", and the button appears after hydration.
const noSubscription = () => () => {};
const canShare = () => typeof navigator.share === "function";
const cannotShareOnServer = () => false;

/**
 * The diver's own invite link: a QR code and an address that let whoever follows
 * it create an account here, counted as this diver's invitation.
 *
 * Mounted by `InvitationsCard` only once its list has loaded. On an `open`-mode
 * instance this block's own route answers 404 as well, and read here as "no link
 * yet" it would offer to make one for the moment before the list's 404 removed
 * the card; mounting after the list is what makes that reading safe.
 *
 * The token lives in component state and nowhere else - read from the API on
 * every visit, never stored in the browser.
 */
export function InviteLinkBlock() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [link, setLink] = useState<LinkState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"reset" | "remove" | null>(null);
  const shareable = useSyncExternalStore(
    noSubscription,
    canShare,
    cannotShareOnServer,
  );

  // A promise chain for the lint rule `InvitationsCard.refresh` names.
  const load = useCallback(
    () =>
      invitationsAPI
        .inviteLink()
        .then((found) =>
          setLink(
            found ? { status: "live", token: found.token } : { status: "none" },
          ),
        )
        .catch((error: unknown) => {
          console.error(LOAD_FAILED, error);
          setLink({
            status: "failed",
            message: getApiErrorMessage(error, LOAD_FAILED),
          });
        }),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Create and Reset are one route: it makes the link, or replaces its token.
  const create = async () => {
    setBusy(true);
    try {
      const created = await invitationsAPI.createInviteLink();
      setLink({ status: "live", token: created.token });
    } catch (error) {
      console.error("Couldn't make your invite link.", error);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Couldn't make your invite link. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await invitationsAPI.removeInviteLink();
      setLink({ status: "none" });
      toast({
        title: "Invite link removed",
        description: "Nobody can create an account through it any more.",
      });
    } catch (error) {
      console.error("Couldn't remove your invite link.", error);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Couldn't remove your invite link. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  if (link.status === "loading") return <SectionSpinner />;

  if (link.status === "failed") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{link.message}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (link.status === "none") {
    return (
      <section
        aria-label="Your invite link"
        className="space-y-3 rounded-md border p-4"
      >
        <p className="text-sm">
          A link of your own lets whoever follows it create an account here as
          your invitation, within the same allowance as the invitations you
          send. Show it as a QR code, or send it.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void create()}
          disabled={busy}
        >
          {busy ? (
            <ButtonSpinner className="mr-2" />
          ) : (
            <Link2 className="h-4 w-4 mr-2" />
          )}
          Create your invite link
        </Button>
      </section>
    );
  }

  const url = inviteLinkUrl(link.token);

  // Nothing is awaited before the write: the clipboard needs the click's user
  // gesture still live, and an `await` ahead of it could spend it.
  const copy = () => {
    let written: Promise<void>;
    try {
      written = navigator.clipboard.writeText(url);
    } catch (error) {
      written = Promise.reject(error);
    }
    written.then(
      () => toast({ title: "Link copied" }),
      (error: unknown) => {
        // No clipboard on a page served over plain HTTP, which a LAN instance is.
        console.error("Couldn't copy the invite link:", error);
        toast({
          title: "Couldn't copy",
          description: "Select the address and copy it from there.",
          variant: "destructive",
        });
      },
    );
  };

  // The invitation email's own subject, the same on every copy, so this block
  // reads nothing from `/config`.
  const share = () => {
    navigator
      .share({
        title: `${user?.name ?? "A diver"} invited you to OpenDiving`,
        url,
      })
      .catch((error: unknown) => {
        // A sheet the diver closed is not a failure.
        if ((error as { name?: string })?.name === "AbortError") return;
        console.error("Couldn't share the invite link:", error);
        toast({
          title: "Couldn't share",
          description: "Copy the address and send it from there.",
          variant: "destructive",
        });
      });
  };

  return (
    <section
      aria-label="Your invite link"
      className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row"
    >
      {/* The card's width on a phone, up to a cap that keeps every module of the
          largest symbol this address makes - 45 modules with its margin - at
          five pixels or more. */}
      <QrCode
        value={url}
        label="QR code of your invite link"
        className="aspect-square w-full max-w-64 shrink-0 self-center sm:w-60 sm:self-start"
      />
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-sm">
          Whoever scans or follows this link can create an account here, counted
          as your invitation. You will see the name on their account, never
          their address. It keeps working until you reset or remove it.
        </p>
        <div className="flex gap-2">
          <Input
            readOnly
            value={url}
            aria-label="Invite link address"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" variant="outline" onClick={copy}>
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {shareable && (
            <Button type="button" variant="outline" onClick={share}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirming("reset")}
            disabled={busy}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirming("remove")}
            disabled={busy}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Remove
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirming === "reset"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Reset your invite link"
        description="The link you have now stops working for anyone who has it, and a new link and QR code take its place. People who already joined through it stay on your list."
        confirmText="Reset"
        isLoading={busy}
        onConfirm={create}
      />
      <ConfirmDialog
        open={confirming === "remove"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Remove your invite link"
        description="The link stops working for anyone who has it. People who already joined through it stay on your list, and you can make a new link later."
        confirmText="Remove"
        isLoading={busy}
        onConfirm={remove}
      />
    </section>
  );
}
