"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, Watch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { moveItem, useDragSort } from "@/hooks/useDragSort";
import { useOptionalList } from "@/hooks/useOptionalList";
import { diveComputersAPI, type DiveComputer } from "@/lib/api/dive-computers";
import { getApiErrorMessage } from "@/lib/api/error";
import { recordingDeviceLabel } from "@/lib/dive-recordings";
import { cn } from "@/lib/utils";

const LIST_FAILED = "Couldn't load your dive computers.";
const ORDER_FAILED =
  "Couldn't save the order of your dive computers. Please try again.";
const loadDiveComputers = () => diveComputersAPI.getDiveComputers();
const NONE: DiveComputer[] = [];

/**
 * The account's dive computers, in the order that decides which one's recording
 * a dive shows by default when two of them recorded it. Reordered by the drag
 * handle alone, with a pointer or the arrow keys.
 *
 * Draws nothing for an account with no computer, and nothing on an API without
 * the route, so it deploys on either side of it.
 */
export function DiveComputersCard() {
  const { toast } = useToast();
  const { list, refresh, update } = useOptionalList(
    loadDiveComputers,
    LIST_FAILED,
  );
  const computers = list.status === "ready" ? list.data : NONE;

  // A move is saved once the list stands still: at once for an arrow key, and
  // on the drop for a drag, which reorders live and would otherwise send an
  // order for every row it passes.
  const unsaved = useRef(false);
  // One save at a time, so the last order sent is the last one stored: moves
  // made while one is in flight are sent together once it settles, which
  // `settledSaves` re-runs the effect for.
  const saving = useRef(false);
  const [settledSaves, setSettledSaves] = useState(0);

  const onReorder = useCallback(
    (from: number, to: number) => {
      unsaved.current = true;
      update((current) => moveItem(current, from, to));
    },
    [update],
  );

  const { draggingIndex, dragOffset, setItemRef, handleProps } = useDragSort({
    itemCount: computers.length,
    onReorder,
  });

  useEffect(() => {
    if (saving.current || draggingIndex !== null || !unsaved.current) return;
    unsaved.current = false;
    saving.current = true;
    diveComputersAPI
      .setOrder(computers.map((computer) => computer.serial))
      .then((answer) => {
        // A move since leaves this answer behind; the next save's is drawn.
        if (!unsaved.current) update(() => answer);
      })
      .catch((error: unknown) => {
        unsaved.current = false;
        toast({
          title: "Error",
          description: getApiErrorMessage(error, ORDER_FAILED),
          variant: "destructive",
        });
        void refresh();
      })
      .finally(() => {
        saving.current = false;
        setSettledSaves((count) => count + 1);
      });
  }, [computers, draggingIndex, refresh, settledSaves, toast, update]);

  if (list.status === "absent" || list.status === "loading") return null;
  if (list.status === "ready" && computers.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Watch className="h-5 w-5" />
          Dive Computers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.status === "failed" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{list.message}</p>
            <Button variant="outline" size="sm" onClick={() => refresh()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <ol
              className={cn(
                "space-y-2",
                draggingIndex !== null && "select-none",
              )}
            >
              {computers.map((computer, index) => {
                // A serial no recording names yet has nothing else to show.
                const label = recordingDeviceLabel(computer) ?? computer.serial;
                const isDragging = draggingIndex === index;
                return (
                  <li
                    key={computer.serial}
                    ref={setItemRef(index)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2",
                      isDragging &&
                        "relative z-10 bg-background shadow-lg ring-2 ring-ring",
                    )}
                    style={
                      isDragging
                        ? { transform: `translateY(${dragOffset}px)` }
                        : undefined
                    }
                  >
                    {computers.length > 1 && (
                      <IconTooltip
                        label={`Reorder ${label}, position ${index + 1} of ${computers.length}. Use arrow up and arrow down to move it.`}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="cursor-grab active:cursor-grabbing"
                          {...handleProps(index)}
                        >
                          <GripVertical className="h-4 w-4" />
                        </Button>
                      </IconTooltip>
                    )}
                    <span className="min-w-0 flex-1 text-sm font-medium break-words">
                      {label}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-muted-foreground">
              When more than one computer recorded a dive, the recording from
              the highest one in this list is shown by default. Dives already in
              your logbook keep the recording they show.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
