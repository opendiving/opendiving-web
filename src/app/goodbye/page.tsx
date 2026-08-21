"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarClock, Trash2 } from "lucide-react";

import { Logo } from "@/components/logo";
import { PageSpinner } from "@/components/ui/page-spinner";
import { formatDateTime } from "@/lib/date-time";

// The last screen of a one-way door, and the only place in the app that ever names
// the purge date. `DELETE /user` composes it and hands it back; the account is dark
// by the time this renders, so there is no session left to ask for it again and
// nothing to poll. It arrives on the URL because that is what survives the page load
// the deletion ends in - see `delete-account-card.tsx`.
//
// Reachable on its own terms as well: a reload, a bookmark, or the back button after
// leaving. A visit with no date is not an error, it is somebody who kept the tab -
// the copy just stops short of naming a day it cannot know.
//
// Chrome-free (see `NO_CHROME_ROUTES` in `app-shell.tsx`), like the other terminal
// auth-flow screens: the header's user menu belongs to a session that no longer
// exists, and the only way on from here is out.
export default function GoodbyePage() {
  // `useSearchParams` needs a Suspense boundary above it or the build fails on this
  // page's prerender - same shape as `/signin` and `/auth/verify`.
  return (
    <Suspense fallback={<PageSpinner />}>
      <GoodbyeWithPurgeDate />
    </Suspense>
  );
}

function GoodbyeWithPurgeDate() {
  const searchParams = useSearchParams();
  return <GoodbyeContent purgeAfter={searchParams.get("purge_after")} />;
}

const PURGE_DAY = {
  year: "numeric",
  month: "long",
  day: "numeric",
} as const;

function GoodbyeContent({ purgeAfter }: { purgeAfter: string | null }) {
  // The clock, read once and kept: whether the deadline has passed is a question
  // about the moment this page opened, and re-reading it on every render would make
  // the copy depend on when React happened to re-render rather than on the date.
  const [loadedAt] = useState(() => Date.now());
  const purgeDate = purgeAfter ? new Date(purgeAfter) : null;
  // An unparseable value reads as no value at all. Anything could have edited the
  // URL, and a date that renders as "Invalid Date" on the screen someone is reading
  // for the one fact it carries is worse than a screen that admits it hasn't got it.
  const purgeOn =
    purgeDate && !Number.isNaN(purgeDate.getTime()) ? purgeDate : null;
  // Whether the deadline is behind us, which is all this can honestly claim to know.
  // Two different visitors reach it: an instance running
  // `ACCOUNT_DELETION_GRACE_DAYS=0`, whose `purge_after` is already past when the
  // response is composed, and anyone reloading, bookmarking or going Back to this URL
  // after their own window ran out. An elapsed timestamp cannot tell those apart, so
  // the copy below talks about the date rather than about how the instance is
  // configured.
  const deadlinePassed = purgeOn !== null && purgeOn.getTime() <= loadedAt;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center space-x-2">
            <Logo className="h-8 w-8 text-coral" />
            <span className="text-2xl font-bold text-foreground">
              OpenDiving
            </span>
          </Link>
        </div>

        {deadlinePassed ? (
          <>
            <Trash2
              className="mx-auto mb-4 h-10 w-10 text-muted-foreground"
              aria-hidden="true"
            />
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Your account has been deleted
            </h1>
            <p className="text-muted-foreground">
              The date it was due to be erased on has passed, so your dives,
              dive sites, certifications and gear are no longer recoverable.
            </p>
          </>
        ) : (
          <>
            <CalendarClock
              className="mx-auto mb-4 h-10 w-10 text-muted-foreground"
              aria-hidden="true"
            />
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Your account has been deleted
            </h1>
            {purgeOn ? (
              <p className="text-muted-foreground">
                You&apos;re signed out everywhere, and nothing has been erased
                yet. Your dives, dive sites, certifications and gear will be
                permanently erased on{" "}
                <span className="font-medium text-foreground">
                  {formatDateTime(purgeOn.toISOString(), PURGE_DAY)}
                </span>
                .
              </p>
            ) : (
              <p className="text-muted-foreground">
                You&apos;re signed out everywhere, and nothing has been erased
                yet. The confirmation email we&apos;ve just sent you names the
                date everything is permanently erased on.
              </p>
            )}
            {/* Deliberately not "sign in again to undo it": signing in during the
                window is `plans/account-deletion.md` §5 and has not landed. Until it
                does the way back is the operator's, which is what the confirmation
                email says too - reword both together. */}
            <p className="text-muted-foreground mt-4">
              Deleted by mistake? Contact whoever runs this OpenDiving instance
              before {purgeOn ? "that date" : "the date in that email"} and it
              can still be undone. Afterwards, nothing can be restored.
            </p>
          </>
        )}

        <p className="text-sm text-muted-foreground mt-8">
          Thanks for diving with us.{" "}
          <Link href="/" className="text-primary hover:underline">
            Back to the home page
          </Link>
        </p>
      </div>
    </div>
  );
}
