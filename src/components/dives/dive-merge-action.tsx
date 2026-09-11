"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Dive, DiveNeighbor, divesAPI } from "@/lib/api/dives";
import { getApiErrorMessage } from "@/lib/api/error";
import { canMergeDive } from "@/lib/dive-recordings";
import { formatDiveDateTime } from "@/lib/date-time";
import { cn } from "@/lib/utils";

interface DiveMergeActionProps {
  dive: Dive;
  // Re-reads the dive after a merge that left this one standing.
  onMerged: () => void | Promise<void>;
}

// How a neighbour is named in the dialog: the diver's own number and the day.
// `#212` alone is ambiguous in a log with duplicate numbers, which the numbering
// summary exists because logs have.
function neighborName(neighbor: DiveNeighbor): string {
  const date = formatDiveDateTime(neighbor.start_time, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `#${neighbor.dive_number}, ${date}`;
}

/**
 * Fold this dive together with the one before or after it.
 *
 * **The two neighbours, and nothing else.** A dive computer that surfaced for a
 * few minutes logs one dive as two consecutive ones, and a second computer's
 * record of one dive sits in the same place - so the candidates are exactly the
 * dives a chopped recording is adjacent to. A free-form dive picker would be a
 * search for something that, by construction, is never more than one step away.
 *
 * Which dive survives is the server's answer, not the diver's: the earlier of
 * the two, by the same clock rule the match gates use. So this navigates to
 * whichever came back rather than assuming it stayed put.
 *
 * Renders nothing for a dive with no recording. The API refuses to merge a
 * hand-entered dive - Subsurface's own rule - and an action that can only 422 is
 * not an action.
 */
export function DiveMergeAction({ dive, onMerged }: DiveMergeActionProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [chosen, setChosen] = useState<DiveNeighbor | null>(null);
  // Keyed by the uuid they were fetched for, the same shape `DiveNeighborNav`
  // uses: this component survives a step of the pager, and plain state would
  // spend that render offering the previous dive's neighbours.
  const [loaded, setLoaded] = useState<{
    diveUuid: string;
    neighbors: DiveNeighbor[];
  } | null>(null);
  // Bumped after a merge this dive survived, which is the one thing that
  // changes the answer without changing the question. Nothing else here can
  // re-run the effect below: the dive's uuid is the same string and it still
  // has recordings, so a refetched dive is a new object with identical
  // dependencies - and the neighbour it just absorbed is soft-deleted and no
  // longer resolves. Without this the dialog goes on offering that uuid, a
  // second merge fails with the generic toast, and the dive that is now
  // genuinely adjacent is missing. Two merges in a row is not a corner case:
  // it is what repairing a computer's three-part split takes.
  const [reloads, setReloads] = useState(0);

  const diveUuid = dive.uuid;
  const mergeable = canMergeDive(dive);

  useEffect(() => {
    if (!mergeable) return;
    let cancelled = false;

    const load = async () => {
      try {
        const neighbors = await divesAPI.getDiveNeighbors(diveUuid);
        if (cancelled) return;
        setLoaded({
          diveUuid,
          neighbors: [neighbors.previous, neighbors.next].filter(
            (neighbor): neighbor is DiveNeighbor => neighbor != null,
          ),
        });
      } catch (error) {
        // Silent, and the button simply doesn't appear. This is a shortcut for
        // an occasional repair, not part of the dive the diver came to read.
        console.error("Failed to load neighbouring dives:", error);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [diveUuid, mergeable, reloads]);

  const neighbors = loaded?.diveUuid === diveUuid ? loaded.neighbors : [];
  if (!mergeable || neighbors.length === 0) return null;

  const handleMerge = async () => {
    if (!chosen) return;
    try {
      setIsMerging(true);
      const result = await divesAPI.mergeDives([dive.uuid, chosen.uuid]);
      setIsOpen(false);
      setChosen(null);

      toast({
        title: "Dives merged",
        description: result.folded
          ? "One computer's two records of the dive were folded into a single recording."
          : "The two recordings are now side by side on one dive.",
      });

      // The survivor is the earlier dive, which is often the *other* one - and
      // the uuid that lost is soft-deleted and no longer resolves, so staying
      // here would be a 404 on the next reload.
      if (result.dive.uuid === dive.uuid) {
        // Cleared before it is refetched, so the button goes away for the one
        // round trip rather than offering a list that is now wrong. The same
        // dead-until-known stance `DiveNeighborNav` takes, and for the same
        // reason: a control pointing somewhere that no longer exists is worse
        // than a control that is briefly absent.
        setLoaded(null);
        setReloads((count) => count + 1);
        await onMerged();
      } else {
        router.push(`/dives/${result.dive.uuid}`);
      }
    } catch (error) {
      console.error("Failed to merge dives:", error);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to merge these dives. Please try again.",
        ),
        variant: "destructive",
      });
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setChosen(neighbors.length === 1 ? neighbors[0] : null);
          setIsOpen(true);
        }}
      >
        <Merge className="h-4 w-4 mr-2" />
        Merge
      </Button>

      <ConfirmDialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) setChosen(null);
        }}
        title="Merge with a neighbouring dive"
        // Says plainly what does *not* come along, because the natural reading
        // is that everything does. The oxygen-exposure readings are the
        // device's own running accounting, not a per-dive quantity that can be
        // added up, and the API deliberately leaves them as they are rather
        // than rewriting a `cns_end` that an import had filled in.
        description="Their recordings, cylinders, sites, gear, species and notes all end up on one dive — the earlier of the two — and the other is deleted for good. The oxygen-exposure readings are left as they are rather than combined."
        confirmText="Merge"
        variant="default"
        isLoading={isMerging}
        confirmDisabled={chosen === null}
        onConfirm={handleMerge}
      >
        <div
          role="group"
          aria-label="Which dive to merge with"
          className="flex flex-col gap-2"
        >
          {neighbors.map((neighbor) => (
            <Button
              key={neighbor.uuid}
              type="button"
              variant={chosen?.uuid === neighbor.uuid ? "secondary" : "outline"}
              aria-pressed={chosen?.uuid === neighbor.uuid}
              className={cn(
                "justify-start",
                chosen?.uuid === neighbor.uuid && "font-semibold",
              )}
              onClick={() => setChosen(neighbor)}
            >
              {neighborName(neighbor)}
            </Button>
          ))}
        </div>
      </ConfirmDialog>
    </>
  );
}
