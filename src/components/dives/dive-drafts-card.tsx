"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FilePen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { diveDraftsAPI, type DiveDraft } from "@/lib/api/dive-drafts";
import { diveSitesAPI } from "@/lib/api/dive-sites";
import { getApiErrorMessage } from "@/lib/api/error";
import { formatDateTime, formatDiveStartTime } from "@/lib/date-time";

// The API's ceiling on a page. A diver keeps a handful of drafts at most, so one
// page is the whole list in practice.
const DRAFTS_PAGE_SIZE = 100;

export interface DiveDraftsCardProps {
  // False until there's a signed-in user.
  enabled: boolean;
  // Called when the last draft is discarded, just before this card goes - the
  // page owes focus somewhere that survives.
  onVanished?: () => void;
}

/** The form a draft opens in. */
export function continueDraftHref(draftUuid: string): string {
  return `/dives/new?draft=${encodeURIComponent(draftUuid)}`;
}

// The account's dive drafts, above the dive list: the dives started on this
// browser or on the OpenDiving app and not yet logged. Nothing at all while there
// are none, like the numbering card - it comes and goes.
export function DiveDraftsCard({ enabled, onVanished }: DiveDraftsCardProps) {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<DiveDraft[]>([]);
  // The primary site's name per site uuid, from one lookup over the drafts shown.
  const [siteNames, setSiteNames] = useState<Record<string, string>>({});
  const [pendingUuid, setPendingUuid] = useState<string | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await diveDraftsAPI.getDrafts(1, DRAFTS_PAGE_SIZE);
      setDrafts(page.data);
      const primaries = [
        ...new Set(
          page.data
            .map((draft) => draft.values.dive_site_uuids?.[0])
            .filter((uuid): uuid is string => !!uuid),
        ),
      ];
      if (primaries.length === 0) return;
      try {
        const sites = await diveSitesAPI.lookupDiveSitesByUuid(primaries);
        setSiteNames(
          Object.fromEntries(sites.map((site) => [site.uuid, site.name])),
        );
      } catch (error) {
        // The rows still list without their site names.
        console.error("Failed to look up the drafts' dive sites:", error);
      }
    } catch (error) {
      // Silent, and the card doesn't render: the dive list is what the diver
      // came for, and a toast over it about drafts would be noise.
      console.error("Failed to load dive drafts:", error);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount, suppressed as in `DiveNumberingCard`.
    if (enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    }
  }, [enabled, load]);

  const confirmDiscard = async () => {
    if (!pendingUuid) return;
    setIsDiscarding(true);
    try {
      await diveDraftsAPI.deleteDraft(pendingUuid);
      const remaining = drafts.filter((draft) => draft.uuid !== pendingUuid);
      if (remaining.length === 0) onVanished?.();
      setDrafts(remaining);
      setPendingUuid(null);
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to discard the draft. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsDiscarding(false);
    }
  };

  if (drafts.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Drafts</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {drafts.map((draft) => {
              const start = draft.values.start_time;
              const site = draft.values.dive_site_uuids?.[0];
              const siteName = site ? siteNames[site] : undefined;
              return (
                <li
                  key={draft.uuid}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">
                      {start ? formatDiveStartTime(start) : "Untitled draft"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {siteName ? `${siteName} · ` : ""}
                      Changed {formatDateTime(draft.updated_at)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingUuid(draft.uuid)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Discard
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={continueDraftHref(draft.uuid)}>
                        <FilePen className="h-4 w-4 mr-2" />
                        Continue
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingUuid !== null}
        onOpenChange={(open) => !open && setPendingUuid(null)}
        title="Discard draft"
        description={DISCARD_DRAFT_CONFIRMATION}
        confirmText="Discard"
        isLoading={isDiscarding}
        onConfirm={confirmDiscard}
      />
    </>
  );
}

/** What both Discard buttons ask before a draft is deleted. */
export const DISCARD_DRAFT_CONFIRMATION =
  "This deletes the draft on every device. It cannot be undone.";
