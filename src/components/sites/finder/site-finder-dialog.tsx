"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import type { DiveSite, DiveSiteSearchItem } from "@/lib/api/dive-sites";
import type { LatLon } from "@/lib/basemap";
import type { FinderTarget } from "@/lib/site-finder-camera";
import { useTags } from "@/hooks/useTags";
import { DiveSiteDialog } from "@/components/sites/dive-site-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NO_FINDER_FILTERS, SiteFinder } from "./site-finder";

export interface SiteFinderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the camera opens, as `SiteFinder.opening` takes it. */
  opening: FinderTarget | null | undefined;
  /** The dive's start time: the diver's sites rank by last use at or before it. */
  until?: string;
  /** The sites the dive already names, which the list does not offer again. */
  chosen: readonly string[];
  /** A site picked from the list or the map: the row, or null for a map point. */
  onPick: (uuid: string, row: DiveSiteSearchItem | null) => void;
  /** A site created from here, and whether the diver chose to propose it. */
  onCreated: (site: DiveSite, proposes: boolean) => void;
}

// The dive form's site finder: the Sites section's map and search in a dialog,
// whose rows put a site on the dive and carry no menu - a delete from inside a
// form's picker could take a site the form holds as a chip. Each pick, and each
// site created here, closes it: most dives have one site.
export function SiteFinderDialog({
  open,
  onOpenChange,
  opening,
  until,
  chosen,
  onPick,
  onCreated,
}: SiteFinderDialogProps) {
  const [filters, setFilters] = useState(NO_FINDER_FILTERS);
  const [wantsTags, setWantsTags] = useState(false);
  const { tags } = useTags(open && wantsTags);
  // The pin a new site opens with; `undefined` while its form is shut.
  const [adding, setAdding] = useState<LatLon | null | undefined>();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Find a dive site</DialogTitle>
          <DialogDescription className="sr-only">
            Search your dive sites, OpenDiving Commons and places, or move the
            map, and pick a site to add it to this dive.
          </DialogDescription>
        </DialogHeader>

        <SiteFinder
          enabled={open}
          opening={opening}
          filters={filters}
          onFiltersChange={setFilters}
          tags={tags ?? undefined}
          onFiltersOpened={() => setWantsTags(true)}
          until={until}
          hiddenUuids={chosen}
          onPickSite={(uuid, row) => {
            onPick(uuid, row);
            onOpenChange(false);
          }}
          onAddSite={setAdding}
          // A dialog has no page to stick the map to the side of.
          mapClassName="lg:static lg:h-[min(40rem,calc(100dvh-14rem))]"
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAdding(null)}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add dive site...
          </Button>
        </DialogFooter>

        <DiveSiteDialog
          open={adding !== undefined}
          onOpenChange={(next) => !next && setAdding(undefined)}
          pin={adding}
          onSaved={(site, proposes) => {
            onCreated(site, proposes);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
