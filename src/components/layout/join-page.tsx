"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { LandingPage } from "@/components/layout/landing-page";
import { PageSpinner } from "@/components/ui/page-spinner";
import { useJoinChannel } from "@/hooks/useJoinChannel";

// The body of `/join?via=<slug>`: the landing page, with its hero holding the
// sign-in form for a join link the API says is live, and exactly the landing page
// for anything else - no `via`, a slug nobody configured or one since removed, or
// an API that did not answer. Silently: a visitor holding a dead link is best served
// by the page they would have reached anyway, whose request form is the next thing
// for them to try.
//
// Named `join-page`, not `join-page-content`, on purpose: like `/`, this is not a
// frame destination, and it holds the landing page's spinner rather than a frame
// (see `app/page-frames.render.test.tsx`, which derives the destination set from
// that suffix).
export function JoinPage() {
  // Not what makes the build pass - see the same boundary in
  // `signin-page-content.tsx`. Nothing under it suspends at run time, so the
  // fallback is only what a prerender holds.
  return (
    <Suspense fallback={<JoinSpinner />}>
      <JoinContent />
    </Suspense>
  );
}

// The landing page's own spinner, so the hand-over to it draws nothing new: the
// hero never paints one form and then swaps it for the other, and the channel is
// part of which form.
function JoinSpinner() {
  return <PageSpinner className="bg-background" />;
}

function JoinContent() {
  const via = useSearchParams().get("via");
  const { channel, isLoading } = useJoinChannel(via);

  // Resolved before the landing page mounts, which then holds the same spinner
  // until its own reads - the session and `/config` - have answered too.
  if (isLoading) return <JoinSpinner />;
  return channel ? <LandingPage channel={channel} /> : <LandingPage />;
}
