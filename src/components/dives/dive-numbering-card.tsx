"use client";

import { useCallback, useEffect, useState } from "react";
import { ListOrdered, ListRestart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { divesAPI, DiveNumberingSummary } from "@/lib/api/dives";
import { describeDiveNumbering } from "@/lib/dive-numbering";
import { RenumberDivesDialog } from "@/components/dives/renumber-dives-dialog";

export interface DiveNumberingCardProps {
  // False until there's a signed-in user - the endpoint reads the caller's own
  // log and takes no user uuid.
  enabled: boolean;
  // Bumped by the page whenever the log itself changes (a dive deleted, say),
  // since that moves numbers this card has already described.
  reloadToken?: number;
  // Called after a renumber writes, so the page can refetch the dive list.
  onRenumbered: () => void;
  // Called when a renumber leaves the log with nothing to renumber, just
  // before this card goes. The page owes focus somewhere that survives.
  onVanished?: () => void;
}

// A card above the dive list saying what a renumber would tidy, and the way in
// to doing it.
//
// Muted and factual: see `describeDiveNumbering` for why this never phrases a
// gap as a problem, and why it says nothing at all about a log a renumber
// would leave alone - which is what keeps this card off most pages most of the
// time. Its own card rather than a line inside the list's, because it is about
// the log rather than part of it, and it comes and goes.
//
// Renumber sits here rather than in settings because this is where a diver is
// when the question occurs to them.
export function DiveNumberingCard({
  enabled,
  reloadToken,
  onRenumbered,
  onVanished,
}: DiveNumberingCardProps) {
  const [summary, setSummary] = useState<DiveNumberingSummary | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Returns what it read as well as storing it, so the renumber path below can
  // tell whether this card is about to remove itself.
  const load = useCallback(async () => {
    try {
      const next = await divesAPI.getDiveNumbering();
      setSummary(next);
      return next;
    } catch (error) {
      // Silent, and the card simply doesn't render. This is a description of
      // the log, not part of it - nothing here is worth a toast over the dive
      // list the diver actually came for.
      console.error("Failed to load dive numbering:", error);
      setSummary(null);
      return null;
    }
  }, []);

  useEffect(() => {
    // Deliberate fetch-on-mount pattern (the state update happens after the
    // network await), suppressed the same way as in `useInfiniteResource` -
    // see the note there on this rule's false positive.
    if (enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    }
  }, [enabled, reloadToken, load]);

  const description = summary ? describeDiveNumbering(summary) : null;
  if (description === null) return null;

  return (
    <>
      {/* `pt-6` because `CardContent`'s own padding assumes a header sits above
          it, and a "Numbering" title would only restate the sentence under it. */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4 shrink-0" />
              {description}
            </span>
            {/* Matches the "New set" button on `/gear` - the same outline/sm
                shape every card-level action in the app uses. `ListRestart` for
                the action, distinct from the `ListOrdered` labelling the
                sentence itself. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDialogOpen(true)}
            >
              <ListRestart className="h-4 w-4 mr-2" />
              Renumber
            </Button>
          </div>
        </CardContent>
      </Card>

      <RenumberDivesDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onRenumbered={() => {
          // The dialog hands focus back to the Renumber button as it closes,
          // and a renumber that tidies the log takes that button off the page
          // a moment later - dropping focus to `<body>`, where nothing says
          // what happened. `onVanished` runs on the summary that decided it,
          // before the render that removes the button, so the page can move
          // focus while there is still focus to move.
          void load().then((next) => {
            if (next && describeDiveNumbering(next) === null) onVanished?.();
          });
          onRenumbered();
        }}
      />
    </>
  );
}
