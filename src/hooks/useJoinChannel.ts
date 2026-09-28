"use client";

import { useEffect, useState } from "react";

import { configAPI, type JoinChannel } from "@/lib/api/config";

interface JoinChannelState {
  // `null` for every way a link can fail to name a live channel: no `via` at all,
  // a slug nobody configured or one since removed, and an API that could not be
  // reached. The page shows the ordinary landing page for all of them, so there is
  // nothing for a caller to tell apart.
  channel: JoinChannel | null;
  isLoading: boolean;
}

/**
 * The channel `/join?via=<slug>` names, asked of the API once per slug.
 *
 * One slug at a time, never a list: the API publishes no list of join links, so a
 * visitor holding one learns nothing about the others. Nothing is stored in the
 * browser for it - the address bar already holds the slug, and a reload asks again,
 * which the API's minute of public caching makes cheap.
 */
export function useJoinChannel(via: string | null): JoinChannelState {
  const [resolved, setResolved] = useState<{
    via: string;
    channel: JoinChannel | null;
  } | null>(null);

  useEffect(() => {
    if (!via) return;
    let active = true;

    // A promise chain rather than `async`/`await` inside the effect, the shape
    // `useInstanceConfig` uses for the same lint rule.
    configAPI
      .getJoinChannel(via)
      .then((channel) => {
        if (active) setResolved({ via, channel });
      })
      .catch((error: unknown) => {
        console.error("Couldn't resolve this join link.", error);
        if (active) setResolved({ via, channel: null });
      });

    return () => {
      active = false;
    };
  }, [via]);

  if (!via) return { channel: null, isLoading: false };
  // Keyed on the slug it answered for, so a different `via` in the same mount is
  // loading until its own answer arrives rather than showing the last one's.
  if (resolved?.via !== via) return { channel: null, isLoading: true };
  return { channel: resolved.channel, isLoading: false };
}
