"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusMessage } from "@/components/ui/status-message";
import { getApiErrorMessage } from "@/lib/api/error";
import { DEFAULT_POST_AUTH_REDIRECT } from "@/lib/auth-redirect";
import { formatPurgeDay, parsePurgeDate } from "@/lib/purge-date";

const RESTORE_FAILED = "Couldn't restore your account. Please try again.";

/**
 * The offer at the end of a sign-in into an account that is waiting to be purged,
 * and the click that undoes the deletion.
 *
 * Nothing has happened yet by the time this renders: the identity was verified, the
 * API answered `deletion_pending`, and no session was issued and no row was touched.
 * Signing in must not quietly cancel a deletion somebody deliberately asked for, so
 * the restore is its own decision and this screen is where it is made.
 */
export function RestoreAccountCard() {
  const { restore, restoreAccount } = useAuth();
  const router = useRouter();
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!restore) {
    return null;
  }

  const purgeOn = parsePurgeDate(restore.purgeAfter);

  const handleRestore = async () => {
    setIsRestoring(true);
    setError(null);
    try {
      await restoreAccount(restore.restoreToken);
      router.push(DEFAULT_POST_AUTH_REDIRECT);
      // Deliberately still `isRestoring`: the navigation is under way, and the
      // token has been spent either way, so re-arming the button would only offer
      // a second restore that cannot succeed.
    } catch (err) {
      // Worth showing verbatim. The API distinguishes a spent or expired token
      // from an account whose grace period ran out while this was on screen, and
      // the second is the one thing the diver most needs to be told plainly.
      setError(getApiErrorMessage(err, RESTORE_FAILED));
      setIsRestoring(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 items-center text-center">
        <CalendarClock
          className="h-10 w-10 mb-2 text-muted-foreground"
          aria-hidden="true"
        />
        <CardTitle className="text-2xl font-bold">
          Your account is scheduled for deletion
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">{restore.email}</span>{" "}
          was deleted, and nothing has been erased yet.{" "}
          {purgeOn ? (
            <>
              Your dives, dive sites, trips, certifications and gear are erased
              for good on{" "}
              <span className="font-medium text-foreground">
                {formatPurgeDay(purgeOn)}
              </span>
              .
            </>
          ) : (
            "Your dives, dive sites, trips, certifications and gear are erased for good once this instance's grace period runs out."
          )}
        </p>
        <p className="text-muted-foreground">
          Restoring brings all of it back and signs you in. Leave it, and the
          date above decides.
        </p>

        {error && <StatusMessage variant="error">{error}</StatusMessage>}

        <Button
          className="w-full"
          onClick={handleRestore}
          disabled={isRestoring}
        >
          {isRestoring ? (
            <span className="flex items-center space-x-2">
              <ButtonSpinner />
              <span>Restoring...</span>
            </span>
          ) : (
            "Restore my account"
          )}
        </Button>

        {/* The one-shot warning, and it is not boilerplate: the six-digit code
            claims its request row before the account is even resolved, so a code
            spent on reaching this screen is spent. Whichever way in was used, this
            offer lives in memory and a reload has nothing to come back to. */}
        <p className="text-xs text-muted-foreground">
          This offer belongs to the sign-in you just completed - if you leave or
          reload this page, sign in again to get back here.
        </p>

        <p className="text-sm text-muted-foreground">
          <Link href="/" className="underline hover:text-foreground">
            No thanks, leave my account deleted
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
