"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Link2, RotateCcw, Share2, Trash2 } from "lucide-react";

import { QrCode } from "@/components/checkin/qr-code";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LinkAddressField } from "@/components/ui/link-address-field";
import { SectionSpinner } from "@/components/ui/section-spinner";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import { connectLinksAPI, connectLinkUrl } from "@/lib/api/connect-links";
import { getApiErrorMessage } from "@/lib/api/error";

type LinkState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "live"; token: string }
  | { status: "failed"; message: string };

const LOAD_FAILED = "Couldn't load your connect link.";

// Whether this browser has a share sheet: Safari, Chrome and Edge do, Firefox on a
// desktop does not. Read through `useSyncExternalStore` so the server render and
// the first client render agree on "no", and the button appears after hydration.
const noSubscription = () => () => {};
const canShare = () => typeof navigator.share === "function";
const cannotShareOnServer = () => false;

// The one thing the pane says that turns on the instance: only where an account
// needs an invitation does the link also make one.
function InviteOnlyNote() {
  const { config } = useInstanceConfig();
  if (config?.registration_mode !== "invite") return null;
  return (
    <p className="text-sm text-muted-foreground">
      Somebody new can also create an account here through it, which counts
      against the invitations you have for the day.
    </p>
  );
}

/**
 * The diver's own connect link: a QR code and an address that let whoever opens
 * it add the diver to their people, connected, on every instance - and on an
 * invite-only one create an account through it, counted as the diver's invitation.
 *
 * The token lives in component state and nowhere else - read from the API each
 * time the pane opens, never stored in the browser.
 */
export function ConnectLinkBlock() {
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

  // A promise chain rather than `async`/`await` in the effect, for
  // `react-hooks/set-state-in-effect`.
  const load = useCallback(
    () =>
      connectLinksAPI
        .getOwn()
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
      const created = await connectLinksAPI.create();
      setLink({ status: "live", token: created.token });
    } catch (error) {
      console.error("Couldn't make your connect link.", error);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Couldn't make your connect link. Please try again.",
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
      await connectLinksAPI.remove();
      setLink({ status: "none" });
      toast({
        title: "Connect link removed",
        description: "Nobody can connect to you through it any more.",
      });
    } catch (error) {
      console.error("Couldn't remove your connect link.", error);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Couldn't remove your connect link. Please try again.",
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
      <section aria-label="Your connect link" className="space-y-3">
        <p className="text-sm">
          A link of your own lets whoever opens it add you to their people,
          connected to your account: they see your picture, name and username,
          and you see them under Added you. Show it as a QR code, or send it.
        </p>
        <InviteOnlyNote />
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
          Create your connect link
        </Button>
      </section>
    );
  }

  const url = connectLinkUrl(window.location.origin, link.token);

  // The connect page's own heading, the same on every copy, so this reads nothing
  // from `/config`.
  const share = () => {
    navigator
      .share({
        title: `${user?.name ?? "A diver"} invited you to connect on OpenDiving`,
        url,
      })
      .catch((error: unknown) => {
        // A sheet the diver closed is not a failure.
        if ((error as { name?: string })?.name === "AbortError") return;
        console.error("Couldn't share the connect link:", error);
        toast({
          title: "Couldn't share",
          description: "Copy the address and send it from there.",
          variant: "destructive",
        });
      });
  };

  return (
    <section aria-label="Your connect link" className="flex flex-col gap-4">
      {/* The pane's width on a phone, up to a cap that keeps every module of the
          largest symbol this address makes - 49 modules with its margin - at
          five pixels or more. */}
      <QrCode
        value={url}
        label="QR code of your connect link"
        className="aspect-square w-full max-w-64 shrink-0 self-center"
      />
      <div className="min-w-0 space-y-3">
        <p className="text-sm">
          Whoever scans or opens this link can add you to their people and see
          your picture, name and username; you see them under Added you. It
          keeps working until you reset or remove it.
        </p>
        <InviteOnlyNote />
        <LinkAddressField
          url={url}
          label="Connect link address"
          what="connect link"
        />
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
        title="Reset your connect link"
        description="The link you have now stops working for anyone who has it, and a new link and QR code take its place. People already connected through it stay connected."
        confirmText="Reset"
        isLoading={busy}
        onConfirm={create}
      />
      <ConfirmDialog
        open={confirming === "remove"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Remove your connect link"
        description="The link stops working for anyone who has it. People already connected through it stay connected, and you can make a new link later."
        confirmText="Remove"
        isLoading={busy}
        onConfirm={remove}
      />
    </section>
  );
}

// The People address that opens the pane on arrival: where the connect page
// sends the owner of the link it was opened with.
export const CONNECT_LINK_PANE_HREF = "/people?show=connect-link";

export const opensConnectLinkPane = (search: string) =>
  new URLSearchParams(search).get("show") === "connect-link";

interface ConnectLinkPaneProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// The People header's Connect link pane. The block mounts only while it is open,
// so the token is read when it is asked for and dropped when it closes.
export function ConnectLinkPane({ open, onOpenChange }: ConnectLinkPaneProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your connect link</DialogTitle>
          <DialogDescription>
            Show it to a buddy, or send it, so they can add you to their people.
          </DialogDescription>
        </DialogHeader>
        {open && <ConnectLinkBlock />}
      </DialogContent>
    </Dialog>
  );
}
