"use client";

import { useEffect, useRef, useState } from "react";

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
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api/error";
import { exportAPI } from "@/lib/api/export";
import { usersAPI } from "@/lib/api/users";
import { downloadBlob } from "@/lib/download";
import { hardNavigate } from "@/lib/navigation";

// How long the archive counts as still being saved after `downloadBlob` has handed it
// to the browser. Two seconds is a margin on the start of a read that begins in the
// same task as the click, not a guess at how long a file takes to write - see
// `handleExportFirst`.
const SAVE_SETTLE_MS = 2_000;

interface DeleteAccountCardProps {
  // Gates the confirm button: the diver types it back before the dialog will
  // delete anything. Also names the archive the secondary action saves, which is
  // the only other thing this card needs from the account.
  username: string;
}

/**
 * The Danger Zone: one button, one confirmation, and no way back afterwards.
 *
 * Deleting is a request, not an erasure. The account goes dark in the same instant
 * - every read 401s and the refresh cookie stops rotating, on this device and every
 * other one - and the data is destroyed later, when the instance's grace period runs
 * out. That date is composed server-side and comes back on the response, so the last
 * thing this card does is carry it to `/goodbye`; there is no signed-in screen left
 * to show it on.
 *
 * The copy deliberately does not tell anyone to sign in again to undo it. Signing in
 * during the window is `plans/account-deletion.md` §5, which has not landed - until
 * it does, the way back is through whoever runs the instance, which is also what the
 * confirmation email says. Reword both in the same change that adds the restore path.
 */
export function DeleteAccountCard({ username }: DeleteAccountCardProps) {
  const { toast } = useToast();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [typedUsername, setTypedUsername] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  // Covers the fetch *and* the moment after it - see `handleExportFirst` for why the
  // two are one state here.
  const [isSaving, setIsSaving] = useState(false);
  const saveSettling = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (saveSettling.current) clearTimeout(saveSettling.current);
    },
    [],
  );

  // Case- and whitespace-insensitive: this is friction, not a password. Someone who
  // has read the dialog and typed their own name back has made the decision the gate
  // exists to ask for, and a capital letter is not evidence that they haven't.
  const confirmed =
    typedUsername.trim().toLowerCase() === username.toLowerCase();

  const openConfirm = () => {
    setTypedUsername("");
    setIsConfirmOpen(true);
  };

  // The gentler thing the description points at, and the one export worth pointing a
  // departing diver at: the archive is the only one carrying the dive-computer files
  // and the certification scans. It goes through `exportAPI` rather than reinventing
  // a download here - same call, same server-named file as the Your Data card above.
  //
  // The dialog stays open behind it. Someone who asked for their data before deleting
  // is mid-decision, and closing the thing they were reading to hand them a file is a
  // way of losing them; the busy label is in the button they pressed.
  const handleExportFirst = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const { blob, filename } = await exportAPI.download("archive", username);
      downloadBlob(blob, filename);
      // Busy for a moment longer than the fetch, because `downloadBlob` returns
      // before the browser has the bytes: it dispatches a synthetic click on an
      // object URL and comes straight back, and Firefox and Safari then read that
      // blob asynchronously and cancel the save if the URL goes away underneath
      // them (`lib/download.ts` holds one for a minute for exactly this reason). A
      // delete resolving in that window takes the whole document, and its object
      // URLs with it. The hold is short because only the *start* of the read has to
      // survive it - the minute in `download.ts` is a margin on a timer nobody is
      // waiting behind, where this one is in front of a diver.
      saveSettling.current = setTimeout(
        () => setIsSaving(false),
        SAVE_SETTLE_MS,
      );
    } catch (error) {
      setIsSaving(false);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Could not export your archive. Please try again.",
        ),
        variant: "destructive",
      });
    }
  };

  // No `finally` resetting the busy state, deliberately: a successful delete ends in a
  // page load, and letting the dialog fall back to an armed confirm button in the
  // frames before the document is replaced offers a second delete on an account that
  // is already gone.
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { purge_after } = await usersAPI.deleteAccount();
      // A full document navigation, for the same reasons `signOut` uses one: the
      // session is over, and everything this one left in memory - fetched dives, blob
      // URLs for private card scans - should go with the document rather than linger
      // in a tab that is no longer signed in. It also settles where the diver lands,
      // rather than racing `useAuthGuard`'s bounce to `/signin`.
      //
      // The date rides in the URL because nothing else survives that load: the access
      // token is gone, the refresh cookie is deleted, and `/goodbye` has no session to
      // ask. It is a date, not an identity - the page itself is the disclosure, not
      // the parameter.
      hardNavigate(`/goodbye?purge_after=${encodeURIComponent(purge_after)}`);
    } catch (error) {
      setIsDeleting(false);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Could not delete your account. Please try again.",
        ),
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Irreversible and destructive actions for your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
          <h4 className="font-medium text-foreground mb-2">Delete Account</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Deleting locks you out straight away, on this device and every other
            one. Your dives, dive sites, trips, certifications, gear and profile
            are then erased for good once this instance&apos;s grace period runs
            out. We&apos;ll email you the exact date; nothing is erased before
            it.
          </p>
          <Button variant="destructive" size="sm" onClick={openConfirm}>
            Delete My Account
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title="Delete your account"
        description="This erases your whole logbook: every dive and its profile, your dive sites, trips, gear and service history, your certifications and the scans of your cards, and the dive-computer files you imported. Take a copy first if you might want any of it - afterwards there is nowhere to take it from."
        confirmText="Delete my account"
        isLoading={isDeleting}
        // Blocked while the archive is still being saved, as well as until the
        // username is typed back. Deleting mid-export destroys the export: the
        // successful delete ends in a page load, which aborts the in-flight request
        // and takes the object URL the save is being read from - so the one gesture
        // that offered the diver their data would be the gesture that took it away,
        // on an account that is dark by then and cannot be asked again. The
        // secondary button reads "Preparing..." throughout, which is what says why
        // the confirm has gone quiet.
        confirmDisabled={!confirmed || isSaving}
        secondaryAction={{
          label: isSaving ? "Preparing..." : "Download my data first",
          onClick: handleExportFirst,
        }}
        onConfirm={handleDelete}
      >
        <div className="space-y-2">
          <Label htmlFor="delete-account-username">
            Type{" "}
            <span className="font-semibold text-foreground">{username}</span> to
            confirm
          </Label>
          <Input
            id="delete-account-username"
            value={typedUsername}
            onChange={(event) => setTypedUsername(event.target.value)}
            // Nothing here is worth a password manager's or a keyboard's help:
            // the point of the field is that it is typed on purpose.
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={isDeleting}
          />
        </div>
      </ConfirmDialog>
    </Card>
  );
}
