"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ComboboxItem,
  ComboboxSearchResult,
  CreatableCombobox,
} from "@/components/ui/creatable-combobox";
import { diveCount } from "@/hooks/useDeleteWithReassign";
import { divesAPI } from "@/lib/api/dives";
import { diveSitesAPI } from "@/lib/api/dive-sites";
import { tripsAPI } from "@/lib/api/trips";

/** Which kind of resource is being deleted, and therefore what its dives hang off. */
export type DeleteTargetKind = "trip" | "dive-site";

// How many options the replacement picker asks for at a time. Matches the dive
// form's own pickers - enough to scroll before typing, far short of the API's cap.
const OPTIONS_PER_SEARCH = 25;

// How long the confirm button waits for the count before giving up on it. Long
// enough that a slow-but-working request still gets to make the offer, short
// enough that a stalled one doesn't hold a Delete button hostage.
const COUNT_TIMEOUT_MS = 5000;

interface KindCopy {
  moveLabel: (count: number) => string;
  pickerLabel: string;
  placeholder: string;
  noItemsLabel: string;
  noMatchesLabel: string;
  search: (userId: string, query: string) => Promise<ComboboxSearchResult>;
  count: (userId: string, uuid: string) => Promise<number>;
}

// Everything the two kinds of delete disagree about. The flow around it - count,
// offer, hand the chosen replacement to the delete - is identical, and everything
// the move itself involves (the ordered site list, the dedupe, the transaction)
// happens on the API side of `move_dives_to`.
const COPY: Record<DeleteTargetKind, KindCopy> = {
  trip: {
    moveLabel: (count) => `Move ${diveCount(count)} to another trip first`,
    pickerLabel: "Move dives to",
    placeholder: "Select a trip...",
    noItemsLabel: "No other trips yet.",
    noMatchesLabel: "No trips match.",
    count: (userId, uuid) => divesAPI.countDives(userId, { tripUuid: uuid }),
    search: async (userId, query) => {
      const response = await tripsAPI.getTrips(
        userId,
        1,
        OPTIONS_PER_SEARCH,
        query,
      );
      return {
        items: response.data.map((trip) => ({
          id: trip.uuid,
          name: trip.name,
        })),
        hasMore: response.has_more,
      };
    },
  },
  "dive-site": {
    moveLabel: (count) => `Move ${diveCount(count)} to another dive site first`,
    pickerLabel: "Move dives to",
    placeholder: "Select a dive site...",
    noItemsLabel: "No other dive sites yet.",
    noMatchesLabel: "No dive sites match.",
    count: (userId, uuid) =>
      divesAPI.countDives(userId, { diveSiteUuid: uuid }),
    search: async (userId, query) => {
      const response = await diveSitesAPI.getDiveSites(
        userId,
        1,
        OPTIONS_PER_SEARCH,
        query,
      );
      return {
        items: response.data.map((site) => ({
          id: site.uuid,
          name: site.name,
          hint: site.location,
        })),
        hasMore: response.has_more,
      };
    },
  },
};

// Everything that has to start clean for each trip/site the diver opens the dialog
// on, held as one object so resetting it is a single `setState`.
interface ReassignState {
  // Null while the count is still in flight - which is not the same as zero, and
  // the reason the offer doesn't appear until the answer does.
  count: number | null;
  countFailed: boolean;
  move: boolean;
  replacement?: ComboboxItem;
}

const INITIAL_STATE: ReassignState = {
  count: null,
  countFailed: false,
  move: false,
};

export interface DeleteWithReassignDialogProps {
  kind: DeleteTargetKind;
  userId: string;
  // The trip / dive site awaiting confirmation, or null when none is. Doubles as
  // the dialog's open state, matching `useDeleteResource`'s `pendingId`.
  targetId: string | null;
  title: string;
  description: string;
  // True while the delete itself is in flight.
  isDeleting: boolean;
  onCancel: () => void;
  // Given the uuid to move the dives onto, or `undefined` to delete outright.
  // The uuid goes straight to `deleteTrip`/`deleteDiveSite` as `move_dives_to`;
  // the name comes along only so the toast afterwards can say where they went,
  // since the API answers with a count and nothing to call the destination.
  onConfirm: (moveDivesTo?: string, name?: string) => void | Promise<void>;
}

/**
 * The delete confirmation for a trip or a dive site, with the offer to hand its
 * dives to another one on the way out.
 *
 * Deleting either leaves the dives behind - the API soft-deletes the row and the
 * dives keep pointing at it - so a diver who merged two duplicate sites, or split a
 * trip in two, was left re-assigning them one dive at a time. The offer only appears
 * once the count has come back non-zero: "move 0 dives" is noise, and a checkbox
 * that appears after a beat is better than one that lies about how much it will do.
 *
 * Moving and deleting are one request - `move_dives_to` on the delete itself - so
 * there is no ordering to get right and no half-done state to report: either the
 * dives are on the replacement and this is gone, or nothing happened. The dialog's
 * whole job is deciding whether to offer, and handing back the uuid that was
 * picked; a failure is an ordinary failed delete, toasted by `useDeleteResource`
 * with the API's own wording.
 */
export function DeleteWithReassignDialog({
  kind,
  userId,
  targetId,
  title,
  description,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteWithReassignDialogProps) {
  const copy = COPY[kind];
  const checkboxId = useId();
  const pickerId = useId();
  const [state, setState] = useState<ReassignState>(INITIAL_STATE);
  // Every option the picker has shown, so the input can keep displaying the chosen
  // one after the query behind it has changed. Same problem `TripCombobox` solves
  // with a name map, minus the lookup: this picker only ever holds something the
  // diver picked out of a menu, never a uuid handed to it by a form.
  //
  // Deliberately not cleared between targets. An entry is only ever read for an id
  // the *current* menu just offered, and offering it means `search` has already
  // written a fresh entry under that id - so the leftovers are unreachable rather
  // than stale, and clearing them would mean touching a ref during render.
  const seenRef = useRef<Map<string, ComboboxItem>>(new Map());

  // Reset during render rather than in an effect, which is React's own answer for
  // state that has to follow a prop (["adjusting state when a prop
  // changes"](https://react.dev/learn/you-might-not-need-an-effect)). An effect
  // would run *after* the dialog had already painted one frame of the previous
  // trip's count, ticked checkbox and chosen replacement; this re-renders before
  // anything reaches the screen. Held as one object so it is a single call.
  const [renderedFor, setRenderedFor] = useState(targetId);
  if (targetId !== renderedFor) {
    setRenderedFor(targetId);
    if (targetId) setState(INITIAL_STATE);
  }

  useEffect(() => {
    if (!targetId || !userId) return;
    let cancelled = false;

    // A hang is not a rejection, and Delete stays disabled until one or the other
    // arrives: `apiClient` sets no axios timeout, so a stalled count would leave
    // the button looking broken for as long as the browser is willing to wait.
    // This gives up on its own and falls into the state a *failed* count already
    // has - a sentence saying so, and Delete clickable again. A late answer is
    // still taken if it turns up, since a real count beats having given up on one.
    const timer = setTimeout(() => {
      if (!cancelled) setState((prev) => ({ ...prev, countFailed: true }));
    }, COUNT_TIMEOUT_MS);

    copy
      .count(userId, targetId)
      .then((count) => {
        if (!cancelled)
          setState((prev) => ({ ...prev, count, countFailed: false }));
      })
      .catch((error) => {
        console.error("Failed to count the dives to reassign:", error);
        // Said out loud rather than swallowed: with the count unknown the offer
        // can't be made, and a dialog that silently drops it would read as "this
        // trip has no dives" to a diver who knows perfectly well that it does.
        if (!cancelled) setState((prev) => ({ ...prev, countFailed: true }));
      })
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [targetId, userId, copy]);

  // The target is filtered out *here*, at the source, rather than through
  // `CreatableCombobox`'s `excludeIds`. That prop only filters the rendered menu;
  // the exact-match paths - typing a name and blurring, or pressing Enter - read
  // the unfiltered result list. Two dive sites called "Blue Hole" is not a corner
  // case but the exact scenario this feature is for, and typing that name while
  // deleting one of them would otherwise resolve to the site being deleted, enable
  // Delete, and send `move_dives_to` equal to the uuid being deleted - a 422 the
  // diver did nothing to deserve. Filtering the result keeps it out of the menu,
  // the exact-match lookup and `seenRef` alike.
  //
  // The other place this could be fixed is inside `CreatableCombobox`, teaching
  // its exact-match paths about `excludeIds` for every future single-select
  // consumer. Not done here: the two existing consumers are append-only
  // multi-selects that the `keepOpenOnSelect` branch already shields, and this is
  // the one caller that needs it.
  const search = useCallback(
    async (query: string) => {
      const result = await copy.search(userId, query);
      const items = result.items.filter((item) => item.id !== targetId);
      items.forEach((item) => seenRef.current.set(item.id, item));
      return { ...result, items };
    },
    [copy, userId, targetId],
  );

  const needsReplacement = state.move && !state.replacement;
  // Held shut until the count lands, because the offer is not on screen yet and a
  // diver who clicks Delete straight away would get the old behaviour without ever
  // being asked - and orphaning them is not undoable from the UI, since a deleted
  // trip no longer appears anywhere to re-point its dives from. A failed count is
  // the exception: nothing more is coming, and deleting outright is still a choice
  // the diver is entitled to make.
  const isCounting = state.count === null && !state.countFailed;

  const handleConfirm = () => {
    // Bail rather than fall through to a plain delete. Unreachable while the
    // button is disabled for exactly this state, but "a move was asked for and
    // did not happen" must never end in a delete if that guard ever moves.
    if (state.move && !state.replacement) return;

    // `undefined` when the box is unchecked, which is what makes this the same
    // delete it has always been - the parameter is simply absent.
    return state.move && state.replacement
      ? onConfirm(state.replacement.id, state.replacement.name)
      : onConfirm();
  };

  return (
    <ConfirmDialog
      open={targetId !== null}
      onOpenChange={(open) => !open && onCancel()}
      title={title}
      description={description}
      confirmText="Delete"
      isLoading={isDeleting}
      confirmDisabled={needsReplacement || isCounting}
      onConfirm={handleConfirm}
    >
      {(isCounting || state.countFailed || (state.count ?? 0) > 0) && (
        <div className="space-y-3">
          {/* Delete is disabled while this shows, and a disabled button with no
              explanation reads as broken rather than as busy. */}
          {isCounting && (
            <p className="text-sm text-muted-foreground">
              Checking which dives this would move...
            </p>
          )}

          {state.countFailed && !isCounting && (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t check which dives this would leave behind.
            </p>
          )}

          {(state.count ?? 0) > 0 && (
            <>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={checkboxId}
                  checked={state.move}
                  disabled={isDeleting}
                  onChange={(event) =>
                    setState((prev) => ({
                      ...prev,
                      move: event.target.checked,
                    }))
                  }
                />
                <Label htmlFor={checkboxId} className="font-normal">
                  {copy.moveLabel(state.count ?? 0)}
                </Label>
              </div>

              {state.move && (
                <div className="space-y-2">
                  <Label htmlFor={pickerId}>{copy.pickerLabel}</Label>
                  <CreatableCombobox
                    id={pickerId}
                    onSearch={search}
                    value={state.replacement?.id}
                    selectedItem={state.replacement}
                    onChange={(id) =>
                      setState((prev) => ({
                        ...prev,
                        replacement: id ? seenRef.current.get(id) : undefined,
                      }))
                    }
                    disabled={isDeleting}
                    placeholder={copy.placeholder}
                    noItemsLabel={copy.noItemsLabel}
                    noMatchesLabel={copy.noMatchesLabel}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </ConfirmDialog>
  );
}
