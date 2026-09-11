"use client";

import { useCallback, useEffect, useState } from "react";
import { ListOrdered, ListRestart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { divesAPI, DiveNumberingSummary } from "@/lib/api/dives";
import { describeDiveNumbering } from "@/lib/dive-numbering";
import { RenumberDivesDialog } from "@/components/dives/renumber-dives-dialog";

export interface DiveNumberingStatusProps {
  // False until there's a signed-in user - the endpoint reads the caller's own
  // log and takes no user uuid.
  enabled: boolean;
  // Bumped by the page whenever the log itself changes (a dive deleted, say),
  // since that moves numbers this line has already described.
  reloadToken?: number;
  // Called after a renumber writes, so the page can refetch the dive list.
  onRenumbered: () => void;
}

// One line above the dive list saying how the log is numbered, and the way in
// to renumbering it.
//
// Muted, factual, and always the same shape whether the numbering is tidy or
// not: see `describeDiveNumbering` for why this never phrases a gap as a
// problem. Renumber sits here rather than in settings because this line is
// where a diver is when the question occurs to them.
export function DiveNumberingStatus({
  enabled,
  reloadToken,
  onRenumbered,
}: DiveNumberingStatusProps) {
  const [summary, setSummary] = useState<DiveNumberingSummary | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setSummary(await divesAPI.getDiveNumbering());
    } catch (error) {
      // Silent, and the line simply doesn't render. This is a description of
      // the log, not part of it - nothing here is worth a toast over the dive
      // list the diver actually came for.
      console.error("Failed to load dive numbering:", error);
      setSummary(null);
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
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 shrink-0" />
          {description}
        </span>
        {/* Matches the "New Set" button on `/gear` - the same outline/sm shape
            every card-level action in the app uses. `ListRestart` for the action,
            distinct from the `ListOrdered` labelling the line itself. */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
        >
          <ListRestart className="h-4 w-4 mr-2" />
          Renumber
        </Button>
      </div>

      <RenumberDivesDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onRenumbered={() => {
          load();
          onRenumbered();
        }}
      />
    </>
  );
}
