"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import {
  ComboboxItem,
  ComboboxSearchResult,
  CreatableCombobox,
} from "@/components/ui/creatable-combobox";
import { diveSitesAPI } from "@/lib/api/dive-sites";
import { tripsAPI } from "@/lib/api/trips";

/** Which kind of resource is being deleted, and therefore what its dives hang off. */
export type DeleteTargetKind = "trip" | "dive-site";

// How many options the replacement picker asks for at a time. Matches the dive
// form's own pickers - enough to scroll before typing, far short of the API's cap.
const OPTIONS_PER_SEARCH = 25;

interface KindCopy {
  title: string;
  // What deleting actually does, stated rather than asked about. True at any
  // number of dives, including none, which is what lets the dialog say it
  // without first going and counting them.
  description: string;
  pickerLabel: string;
  // The picker's empty state doubles as the "don't move anything" option, so the
  // placeholder has to read as a choice rather than as an instruction.
  placeholder: string;
  noItemsLabel: string;
  noMatchesLabel: string;
  // Shown while the field holds text that isn't a choice yet, since Delete is
  // blocked for that and a disabled button with no explanation reads as broken.
  unresolvedHint: string;
  search: (query: string) => Promise<ComboboxSearchResult>;
}

// Everything the two kinds of delete disagree about. The flow around it - state
// the consequence, offer a destination, hand back what was picked - is identical,
// and everything the move itself involves (the ordered site list, the dedupe, the
// transaction) happens on the API side of `move_dives_to`.
const COPY: Record<DeleteTargetKind, KindCopy> = {
  trip: {
    title: "Delete trip",
    description:
      "Deleting removes this trip from every dive logged on it. The dives themselves are not touched.",
    pickerLabel: "Move its dives to",
    placeholder: "No trip — just remove it",
    noItemsLabel: "No other trips yet.",
    noMatchesLabel: "No trips match.",
    unresolvedHint:
      "Pick a trip from the list, or clear the field to delete without moving.",
    search: async (query) => {
      const response = await tripsAPI.getTrips(1, OPTIONS_PER_SEARCH, query);
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
    title: "Delete dive site",
    description:
      "Deleting removes this site from every dive logged here. The dives themselves are not touched.",
    pickerLabel: "Move those dives to",
    placeholder: "No site — just remove it",
    noItemsLabel: "No other dive sites yet.",
    noMatchesLabel: "No dive sites match.",
    unresolvedHint:
      "Pick a dive site from the list, or clear the field to delete without moving.",
    search: async (query) => {
      const response = await diveSitesAPI.getDiveSites(
        1,
        OPTIONS_PER_SEARCH,
        query,
      );
      return {
        items: response.data.map((site) => ({
          id: site.uuid,
          name: site.name,
          hint: site.location?.name,
        })),
        hasMore: response.has_more,
      };
    },
  },
};

export interface DeleteWithReassignDialogProps {
  kind: DeleteTargetKind;
  // The trip / dive site awaiting confirmation, or null when none is. Doubles as
  // the dialog's open state, matching `useDeleteResource`'s `pendingId`.
  targetId: string | null;
  // True while the delete itself is in flight.
  isDeleting: boolean;
  onCancel: () => void;
  // Given the uuid to move the dives onto, or nothing to delete outright. The
  // uuid goes straight to `deleteTrip`/`deleteDiveSite` as `move_dives_to`; the
  // name comes along only so the toast afterwards can say where they went, since
  // the API has no reason to know what the destination is called.
  onConfirm: (moveDivesTo?: string, name?: string) => void | Promise<void>;
}

/**
 * The delete confirmation for a trip or a dive site, with the offer to hand its
 * dives to another one on the way out.
 *
 * The dialog states what deleting does - the dives keep their own records and
 * lose this reference - and then offers somewhere to put that reference instead.
 * The offer is always on screen, and leaving the picker empty is the plain delete
 * this replaced. Merging two "Blue Hole" entries is the case it exists for.
 *
 * Moving and deleting are one request - `move_dives_to` on the delete itself - so
 * there is no ordering to get right and no half-done state to report: either the
 * dives are on the replacement and this is gone, or nothing happened. The dialog's
 * whole job is handing back the uuid that was picked; a failure is an ordinary
 * failed delete, toasted by `useDeleteResource` with the API's own wording.
 */
export function DeleteWithReassignDialog({
  kind,
  targetId,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteWithReassignDialogProps) {
  const copy = COPY[kind];
  const pickerId = useId();
  const [replacement, setReplacement] = useState<ComboboxItem | undefined>();
  // What the picker's field currently reads, which is not the same question as
  // what has been chosen - see `unresolved` below.
  const [pickerText, setPickerText] = useState("");
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
  // trip's chosen replacement; this re-renders before anything reaches the screen.
  const [renderedFor, setRenderedFor] = useState(targetId);
  if (targetId !== renderedFor) {
    setRenderedFor(targetId);
    if (targetId) setReplacement(undefined);
  }

  // A half-typed destination is not a chosen one. Typing clears the combobox's
  // selection, and only an *exact* match re-fills it, so "Ceb" with "Cebu 2026"
  // sitting in the menu leaves `replacement` undefined - and the click on Delete
  // blurs the field, which for a prefix commits nothing. Confirming from there
  // would quietly delete without the move the diver was in the middle of asking
  // for, and neither half of that is undoable from the UI. Blocked rather than
  // guessed at: a prefix can match several trips, and picking one for the diver
  // is the kind of help that moves a log somewhere they didn't choose.
  //
  // An *empty* field stays a valid answer - it is the plain delete this dialog
  // replaced, and the reason there is no checkbox any more.
  const unresolved = pickerText.trim() !== "" && !replacement;

  // The target is filtered out *here*, at the source, rather than through
  // `CreatableCombobox`'s `excludeIds`. That prop only filters the rendered menu;
  // the exact-match paths - typing a name and blurring, or pressing Enter - read
  // the unfiltered result list. Two dive sites called "Blue Hole" is not a corner
  // case but the exact scenario this feature is for, and typing that name while
  // deleting one of them would otherwise resolve to the site being deleted and
  // send `move_dives_to` equal to the uuid being deleted - a 422 the diver did
  // nothing to deserve. Filtering the result keeps it out of the menu, the
  // exact-match lookup and `seenRef` alike.
  //
  // The other place this could be fixed is inside `CreatableCombobox`, teaching
  // its exact-match paths about `excludeIds` for every future single-select
  // consumer. Not done here: the two existing consumers are append-only
  // multi-selects that the `keepOpenOnSelect` branch already shields, and this is
  // the one caller that needs it.
  const search = useCallback(
    async (query: string) => {
      const result = await copy.search(query);
      const items = result.items.filter((item) => item.id !== targetId);
      items.forEach((item) => seenRef.current.set(item.id, item));
      return { ...result, items };
    },
    [copy, targetId],
  );

  return (
    <ConfirmDialog
      open={targetId !== null}
      onOpenChange={(open) => !open && onCancel()}
      title={copy.title}
      description={copy.description}
      confirmText="Delete"
      isLoading={isDeleting}
      confirmDisabled={unresolved}
      // `undefined` when nothing is picked, which is what makes this the same
      // delete it has always been - the parameter is simply absent.
      onConfirm={() =>
        replacement ? onConfirm(replacement.id, replacement.name) : onConfirm()
      }
    >
      <div className="space-y-2">
        <Label htmlFor={pickerId}>{copy.pickerLabel}</Label>
        <CreatableCombobox
          id={pickerId}
          onSearch={search}
          value={replacement?.id}
          selectedItem={replacement}
          onChange={(id) =>
            setReplacement(id ? seenRef.current.get(id) : undefined)
          }
          disabled={isDeleting}
          placeholder={copy.placeholder}
          onTextChange={setPickerText}
          noItemsLabel={copy.noItemsLabel}
          noMatchesLabel={copy.noMatchesLabel}
        />
        {unresolved && (
          <p className="text-sm text-muted-foreground">{copy.unresolvedHint}</p>
        )}
      </div>
    </ConfirmDialog>
  );
}
