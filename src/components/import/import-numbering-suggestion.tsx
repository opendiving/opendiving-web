"use client";

import { useEffect, useRef, useState } from "react";
import { ListOrdered, ListRestart } from "lucide-react";

import {
  RenumberDivesDialog,
  type RenumberDefaults,
} from "@/components/dives/renumber-dives-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { divesAPI, type DiveNumberingSummary } from "@/lib/api/dives";
import type { ImportDiveReport } from "@/lib/api/logbook-import";
import { formatDateOnly, getBrowserUtcOffsetMinutes } from "@/lib/date-time";
import {
  describeDiveNumbering,
  importRenumberScope,
  numberingTangledSince,
} from "@/lib/dive-numbering";

interface Suggestion {
  description: string;
  defaults: RenumberDefaults;
}

interface ImportNumberingSuggestionProps {
  /** The log's numbering as it stood when the files were read. */
  before: DiveNumberingSummary;
  dives: readonly ImportDiveReport[];
}

// The result's offer to renumber, shown only where the import left more dives
// sharing a number or out of date order than the log had before it. The dialog
// opens on the part of the log the import reached, so a log that continues a
// paper logbook at #47 is not offered a restart at #1.
//
// An offer rather than a step of the import: the renumber dialog stays the only
// thing that rewrites a number, and it shows every change first.
export function ImportNumberingSuggestion({
  before,
  dives,
}: ImportNumberingSuggestionProps) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [renumbered, setRenumbered] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const scope = importRenumberScope(dives, getBrowserUtcOffsetMinutes());
    if (scope === null) return;

    let cancelled = false;
    (async () => {
      try {
        const after = await divesAPI.getDiveNumbering();
        const description = describeDiveNumbering(after);
        if (description === null || !numberingTangledSince(before, after)) {
          return;
        }
        const next = await divesAPI.getNextDiveNumber(scope.lastInstantBefore);
        if (cancelled) return;
        setSuggestion({
          description,
          defaults: { startAt: next.dive_number, fromDate: scope.fromDate },
        });
      } catch (error) {
        // Silent, as the numbering card on the dive list is: the import is
        // written either way, and that card still offers the renumber.
        console.error("Failed to check numbering after the import:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [before, dives]);

  if (suggestion === null) return null;

  return (
    <>
      {renumbered ? (
        <p
          ref={statusRef}
          tabIndex={-1}
          role="status"
          className="text-sm text-muted-foreground"
        >
          Your dives are renumbered.
        </p>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <ListOrdered className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  {suggestion.description}{" "}
                  {`Renumbering from ${formatDateOnly(suggestion.defaults.fromDate)} numbers every dive from then on in date order.`}
                </p>
              </div>
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
      )}

      <RenumberDivesDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        defaults={suggestion.defaults}
        onRenumbered={() => setRenumbered(true)}
        // The Renumber button has gone by the time the dialog closes on a
        // renumber, so the status that replaced it takes focus instead.
        onCloseAutoFocus={(event) => {
          if (!statusRef.current) return;
          event.preventDefault();
          statusRef.current.focus();
        }}
      />
    </>
  );
}
