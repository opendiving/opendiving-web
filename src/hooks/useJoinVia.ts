"use client";

import { useEffect, useState } from "react";

import {
  configAPI,
  type InviteLinkDoor,
  type JoinChannel,
} from "@/lib/api/config";

interface JoinViaState {
  // At most one of the two is set. Both are `null` for every way a `via` can fail
  // to name a live door: no `via` at all, a token or slug that is not live, and an
  // API that could not be reached. The page shows the ordinary landing page for
  // all of them, so there is nothing for a caller to tell apart.
  inviteLink: InviteLinkDoor | null;
  channel: JoinChannel | null;
  isLoading: boolean;
}

type Door = Pick<JoinViaState, "inviteLink" | "channel">;

const NO_DOOR: Door = { inviteLink: null, channel: null };

// A member's invite link first, and a join channel only on its 404. The link
// resolver answers `no-store`, while the channel one is publicly cacheable for a
// minute, so a live bearer token must never be the first thing the channel route
// sees. A failed link request therefore stops here rather than falling through:
// the token it carried may well be live.
async function resolveVia(via: string): Promise<Door> {
  const inviteLink = await configAPI.getInviteLink(via);
  if (inviteLink) return { inviteLink, channel: null };
  return { inviteLink: null, channel: await configAPI.getJoinChannel(via) };
}

/**
 * What `/join?via=<x>` names - a member's invite link or a join channel - asked of
 * the API once per `via`.
 *
 * One value at a time, never a list: the API publishes no list of either, so a
 * visitor holding one link learns nothing about the others. Nothing is stored in
 * the browser for it - the address bar already holds the value, and a reload asks
 * again.
 */
export function useJoinVia(via: string | null): JoinViaState {
  const [resolved, setResolved] = useState<{ via: string; door: Door } | null>(
    null,
  );

  useEffect(() => {
    if (!via) return;
    let active = true;

    // A promise chain rather than `async`/`await` inside the effect, the shape
    // `useInstanceConfig` uses for the same lint rule.
    resolveVia(via)
      .then((door) => {
        if (active) setResolved({ via, door });
      })
      .catch((error: unknown) => {
        console.error("Couldn't resolve this link.", error);
        if (active) setResolved({ via, door: NO_DOOR });
      });

    return () => {
      active = false;
    };
  }, [via]);

  if (!via) return { ...NO_DOOR, isLoading: false };
  // Keyed on the value it answered for, so a different `via` in the same mount is
  // loading until its own answer arrives rather than showing the last one's.
  if (resolved?.via !== via) return { ...NO_DOOR, isLoading: true };
  return { ...resolved.door, isLoading: false };
}
