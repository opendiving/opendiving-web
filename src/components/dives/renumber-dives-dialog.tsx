"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/use-toast";
import { divesAPI, DiveRenumberResult } from "@/lib/api/dives";
import {
  combineStartTime,
  formatDiveDateTime,
  getBrowserUtcOffsetMinutes,
} from "@/lib/date-time";
import { getApiErrorMessage } from "@/lib/api/error";

// Long enough that typing "1", "0", "2" into the start-at box is one preview
// rather than three.
const PREVIEW_DEBOUNCE_MS = 350;

// Turns the scope date picker's "YYYY-MM-DD" into the offset-aware instant the
// API compares against.
//
// Midnight in the *browser's* current offset, which is a choice worth naming:
// a dive's `start_time` carries its own original offset, so a boundary of
// "2023-01-01" is inherently a little fuzzy for a diver who was in another
// timezone that week. The alternative - asking for a date *and* a timezone -
// buys precision nobody needs to split a log into "the old part" and "the
// recent part", which is the only thing this control is for.
//
// This is one of the two remaining write paths that stamps the browser's offset
// on, and it stays that way while the display and edit paths stop: it names an
// *instant* to compare dives against, and `DiveRenumberRequest.from_start_time`
// is offset-required on the API for that reason. Nothing here is editing a
// dive's own recorded zone, so there is no unknown state to preserve.
function scopeStartTime(date: string): string | undefined {
  if (!date) return undefined;
  return combineStartTime(`${date} 00:00:00`, getBrowserUtcOffsetMinutes());
}

// A preview, tagged with the inputs that produced it. Tagged rather than just
// stored, so the change list on screen and the button under it can never
// describe different renumbers: everything below is gated on the preview
// matching what the form currently says.
interface TaggedPreview {
  startAt: number;
  fromDate: string;
  // Null when the request failed - distinct from having no preview for these
  // inputs yet, which is `null` for the whole `TaggedPreview`.
  result: DiveRenumberResult | null;
}

function RenumberForm({ onDone }: { onDone: (renumbered: boolean) => void }) {
  const { toast } = useToast();
  const [startAt, setStartAt] = useState("1");
  const [fromDate, setFromDate] = useState("");
  const [preview, setPreview] = useState<TaggedPreview | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // `""` while the box is empty mid-edit; nothing is previewed until it holds a
  // number, rather than previewing a renumber from 1 nobody asked for.
  const parsedStartAt = Number.parseInt(startAt, 10);
  const isStartAtValid = Number.isInteger(parsedStartAt) && parsedStartAt >= 1;

  const isPreviewCurrent =
    preview !== null &&
    preview.startAt === parsedStartAt &&
    preview.fromDate === fromDate;

  useEffect(() => {
    if (!isStartAtValid) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      let result: DiveRenumberResult | null = null;
      try {
        result = await divesAPI.renumberDives({
          start_at: parsedStartAt,
          from_start_time: scopeStartTime(fromDate),
          dry_run: true,
        });
      } catch (error) {
        // Shown in place of the change list rather than toasted: a preview that
        // failed to load is information about this dialog, not about the log.
        console.error("Failed to preview the renumber:", error);
      }
      // One state update for both outcomes, tagged with the inputs it came
      // from - a failed preview still has to replace whatever was on screen,
      // or the diver reads a change list for different settings.
      if (!cancelled) setPreview({ startAt: parsedStartAt, fromDate, result });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isStartAtValid, parsedStartAt, fromDate]);

  const apply = async () => {
    try {
      setIsApplying(true);
      const result = await divesAPI.renumberDives({
        start_at: parsedStartAt,
        from_start_time: scopeStartTime(fromDate),
      });
      toast({
        title: "Dives renumbered",
        description: `${result.changes.length} dive${
          result.changes.length === 1 ? "" : "s"
        } renumbered.`,
      });
      onDone(true);
    } catch (error) {
      console.error("Failed to renumber dives:", error);
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to renumber dives. Please try again.",
        ),
        variant: "destructive",
      });
      setIsApplying(false);
    }
  };

  const changeCount = isPreviewCurrent
    ? (preview.result?.changes.length ?? 0)
    : 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Renumber dives</DialogTitle>
        <DialogDescription>
          Numbers your dives consecutively in date order. Nothing else about
          them changes. Worth doing once your log is complete — if some of your
          dives are recorded elsewhere, the gaps between your numbers may be
          deliberate.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="renumber-start-at">Start at</Label>
            <Input
              id="renumber-start-at"
              type="number"
              min="1"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              disabled={isApplying}
            />
            <p className="text-xs text-muted-foreground">
              The number your earliest dive in scope gets.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="renumber-from">Only dives from</Label>
            <DatePicker
              value={fromDate}
              onChange={setFromDate}
              placeholder="All dives"
              disabled={isApplying}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to renumber the whole log.
            </p>
          </div>
        </div>

        <div className="rounded-md border p-3 text-sm">
          {!isStartAtValid ? (
            <span className="text-muted-foreground">
              Enter a starting number of 1 or more.
            </span>
          ) : !isPreviewCurrent ? (
            <span className="flex items-center text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Working out what would change…
            </span>
          ) : preview.result === null ? (
            <span className="text-muted-foreground">
              Couldn&apos;t load a preview. Check your connection and try again.
            </span>
          ) : changeCount === 0 ? (
            <span className="text-muted-foreground">
              {preview.result.dives_in_scope === 0
                ? "No dives fall in this range."
                : "Your dives are already numbered this way — nothing would change."}
            </span>
          ) : (
            <>
              <p className="font-medium mb-2">
                {changeCount} of {preview.result.dives_in_scope} dive
                {preview.result.dives_in_scope === 1 ? "" : "s"} would be
                renumbered.
              </p>
              {/* Every change, scrollable - a preview that says "and 180 more"
                  hides exactly the rows a diver would want to check against a
                  paper logbook. */}
              <ul className="max-h-56 overflow-y-auto space-y-1">
                {preview.result.changes.map((change) => (
                  <li
                    key={change.dive_uuid}
                    className="flex justify-between gap-4 text-muted-foreground"
                  >
                    <span className="tabular-nums">
                      #{change.dive_number} → #{change.new_dive_number}
                    </span>
                    <span className="truncate">
                      {formatDiveDateTime(change.start_time)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onDone(false)}
          disabled={isApplying}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={apply}
          // Gated on `isPreviewCurrent`, not just on there being changes: the
          // button must never apply a renumber the diver hasn't been shown.
          disabled={isApplying || !isPreviewCurrent || changeCount === 0}
        >
          {isApplying ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Renumbering…
            </>
          ) : (
            `Renumber ${changeCount} dive${changeCount === 1 ? "" : "s"}`
          )}
        </Button>
      </DialogFooter>
    </>
  );
}

export interface RenumberDivesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after numbers have actually been written, so the caller can refetch
  // the list and the numbering summary this just invalidated.
  onRenumbered: () => void;
}

// Renumbers a log consecutively, in date order. The only thing in the app that
// rewrites numbers a diver typed - which is why it's a dialog they open, shows
// them every change before making it, and is never triggered by anything else.
//
// The form is a child mounted only while open, so each visit starts from clean
// defaults rather than inheriting half-remembered inputs from the last one.
export function RenumberDivesDialog({
  open,
  onOpenChange,
  onRenumbered,
}: RenumberDivesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? (
          <RenumberForm
            onDone={(renumbered) => {
              if (renumbered) onRenumbered();
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
