"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ui/use-toast";
import { checkinLinkAPI, checkinLinkUrl } from "@/lib/api/checkin-links";
import { getApiErrorMessage } from "@/lib/api/error";
import { divingFiguresToWire, type DivingFigures } from "@/lib/checkin";

/**
 * The diver's live check-in link. `url` is set only for a link made in this visit: the
 * API keeps a hash of the token and never answers with it again, so a link found on a
 * later visit is its expiry and nothing more.
 */
export interface LiveCheckinLink {
  expiresAt: string;
  url: string | null;
}

export interface CheckinLinkControls {
  live: LiveCheckinLink | null;
  /** True while a mint or a revoke is in flight. */
  busy: boolean;
  /** Makes a new link showing these figures, retiring any live one. */
  mint: (figures: DivingFigures) => Promise<void>;
  revoke: () => Promise<void>;
}

/**
 * Reads, makes and revokes the signed-in diver's check-in link. Reads nothing until
 * `enabled`, which the page holds off until the session has settled.
 */
export function useCheckinLink(enabled: boolean): CheckinLinkControls {
  const { toast } = useToast();
  const [live, setLive] = useState<LiveCheckinLink | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped by every mint and revoke, so a read that set out before one of them cannot
  // land after it and put back the link it just replaced.
  const generation = useRef(0);

  // A plain effect, re-reading whenever the route is shown again: a link can have
  // expired, or been replaced from another device, while the page was hidden. A
  // promise chain because `react-hooks/set-state-in-effect` rejects a
  // synchronous-looking setState here.
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const started = generation.current;
    checkinLinkAPI
      .live(controller.signal)
      .then((found) => {
        if (controller.signal.aborted || generation.current !== started) return;
        setLive((current) =>
          found === null
            ? null
            : // The link this visit made keeps its address; any other is shown bare.
              current?.expiresAt === found.expires_at
              ? current
              : { expiresAt: found.expires_at, url: null },
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // Quietly: without it the page still shares, and a live link it could not
        // see is retired by the next one made anyway.
        console.error("Couldn't read the check-in link:", error);
      });
    return () => controller.abort();
  }, [enabled]);

  const mint = useCallback(
    async (figures: DivingFigures) => {
      generation.current += 1;
      setBusy(true);
      try {
        const { token, expires_at } = await checkinLinkAPI.mint(
          divingFiguresToWire(figures),
        );
        setLive({
          expiresAt: expires_at,
          url: checkinLinkUrl(window.location.origin, token),
        });
      } catch (error) {
        console.error("Couldn't make a check-in link:", error);
        toast({
          title: "Error",
          description: getApiErrorMessage(
            error,
            "Couldn't make a link. Please try again.",
          ),
          variant: "destructive",
        });
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const revoke = useCallback(async () => {
    generation.current += 1;
    setBusy(true);
    try {
      await checkinLinkAPI.revoke();
      setLive(null);
      toast({
        title: "Link revoked",
        description: "It no longer opens your check-in page.",
      });
    } catch (error) {
      console.error("Couldn't revoke the check-in link:", error);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Couldn't revoke the link. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, [toast]);

  return { live, busy, mint, revoke };
}
