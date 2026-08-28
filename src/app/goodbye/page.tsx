"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarClock, Trash2 } from "lucide-react";

import { StandaloneShell } from "@/components/layout/standalone-shell";
import { PageSpinner } from "@/components/ui/page-spinner";
import { formatPurgeDay, parsePurgeDate } from "@/lib/purge-date";

// The last screen of a deletion. `DELETE /user` composes the purge date and hands it
// back exactly once; the account is dark by the time this renders, so there is no
// session left to ask for it again and nothing to poll. It arrives on the URL because
// that is what survives the page load the deletion ends in - see
// `delete-account-card.tsx`. The restore screen names the same date from the other
// end of the window, and both parse it through `lib/purge-date.ts`.
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

function GoodbyeContent({ purgeAfter }: { purgeAfter: string | null }) {
  // The clock, read once and kept: whether the deadline has passed is a question
  // about the moment this page opened, and re-reading it on every render would make
  // the copy depend on when React happened to re-render rather than on the date.
  const [loadedAt] = useState(() => Date.now());
  // An unparseable value reads as no value at all. Anything could have edited the
  // URL, and a date that renders as "Invalid Date" on the screen someone is reading
  // for the one fact it carries is worse than a screen that admits it hasn't got it.
  const purgeOn = parsePurgeDate(purgeAfter);
  // Whether the deadline is behind us, which is all this can honestly claim to know.
  // Two different visitors reach it: an instance running
  // `ACCOUNT_DELETION_GRACE_DAYS=0`, whose `purge_after` is already past when the
  // response is composed, and anyone reloading, bookmarking or going Back to this URL
  // after their own window ran out. An elapsed timestamp cannot tell those apart, so
  // the copy below talks about the date rather than about how the instance is
  // configured.
  const deadlinePassed = purgeOn !== null && purgeOn.getTime() <= loadedAt;

  return (
    <StandaloneShell className="text-center">
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
            The date it was due to be erased on has passed, so your dives, dive
            sites, trips, courses, certifications and gear are no longer
            recoverable.
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
              yet. Your dives, dive sites, trips, courses, certifications and
              gear will be permanently erased on{" "}
              <span className="font-medium text-foreground">
                {formatPurgeDay(purgeOn)}
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
          {/* The way back, in the same words as the confirmation email and the
                Danger Zone card - all three describe one behaviour, so reword them
                together. Signing in reaches an offer to restore, not a session. */}
          <p className="text-muted-foreground mt-4">
            Deleted by mistake? Sign in again before{" "}
            {purgeOn ? "that date" : "the date in that email"} and you&apos;ll
            be offered your account back. Afterwards, nothing can be restored.
          </p>
        </>
      )}

      <p className="text-sm text-muted-foreground mt-8">
        Thanks for diving with us.{" "}
        <Link href="/" className="text-primary hover:underline">
          Back to the home page
        </Link>
      </p>
    </StandaloneShell>
  );
}
