"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import Link from "next/link";
import { LocateFixed, Plus, Search, X } from "lucide-react";

import {
  diveSitesAPI,
  isCommonsSite,
  type DiveSiteListSort,
  type DiveSiteSearchItem,
  type DiveSiteSearchRow,
} from "@/lib/api/dive-sites";
import { PLACE_SEARCH_DEBOUNCE_MS } from "@/lib/api/geocoding";
import type { PaginatedResponse } from "@/lib/api/client";
import type { Tag } from "@/lib/api/tags";
import type { LatLon } from "@/lib/basemap";
import { locationTarget } from "@/lib/site-finder-opening";
import type { FinderTarget } from "@/lib/site-finder-camera";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useSiteFinderPoints } from "@/hooks/useSiteFinderPoints";
import { MapCredit } from "@/components/map/map-credit";
import { CommonsBadge, CommonsCredit } from "@/components/sites/commons-site";
import {
  NO_SITE_FILTERS,
  SitesFilters,
  siteFiltersChanged,
} from "@/components/sites/sites-filters";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import { ListFiltersButton } from "@/components/ui/list-filters-button";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { SearchInput } from "@/components/ui/search-input";
import { ListRowsSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { IconTooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { SiteFinderMap } from "./site-finder-map-lazy";
import type { FinderMapPoint, FinderView } from "./site-finder-points";
import { PlaceRow, SiteRow } from "./site-finder-rows";
import { finderReducer } from "./site-finder-state";

/**
 * What narrows the finder's list beside the search. `yours` is *Your sites*;
 * the tag, the sort and the match filter apply under it alone.
 */
export interface SiteFinderFilters {
  yours: boolean;
  tagUuid: string;
  sort: DiveSiteListSort;
  /** Only the diver's own sites that are also Commons records. */
  commonsMatch: boolean;
}

export const NO_FINDER_FILTERS: SiteFinderFilters = {
  yours: false,
  ...NO_SITE_FILTERS,
  commonsMatch: false,
};

/** What a host can ask of the finder after a write of its own. */
export interface SiteFinderHandle {
  /** Read the list and the diver's points again, from the first page. */
  reload(): void;
  /** Drop one site's row where it is, and read the diver's points again. */
  removeSite(uuid: string): void;
}

export interface SiteFinderProps {
  /** Hold every request until this is true - until the diver is known. */
  enabled: boolean;
  /**
   * Where the camera opens: a target, the world (`null`), or not known yet
   * (`undefined`), while which the list asks nothing and the map waits on the
   * world rather than jumping twice.
   */
  opening: FinderTarget | null | undefined;
  filters: SiteFinderFilters;
  onFiltersChange: (filters: SiteFinderFilters) => void;
  /** What the tag select offers, and the cue to read them: the panel opening. */
  tags?: readonly Tag[];
  onFiltersOpened?: () => void;
  /** The date a picker ranks the diver's sites at or before, as the lookup's. */
  until?: string;
  /** Sites a host already holds, dropped from the list - the only drop it makes. */
  hiddenUuids?: readonly string[];
  /** A site's page: rows and touched points link to it where given. */
  siteHref?: (uuid: string) => string;
  /** Otherwise a pick: the row picked, or null for a point touched on the map. */
  onPickSite?: (uuid: string, row: DiveSiteSearchItem | null) => void;
  /** The cards' menu on each row under *Your sites*, where the host offers one. */
  siteMenu?: (site: DiveSiteSearchItem) => ReactNode;
  /** Opens the site form with its pin at the map's centre, or none without a map. */
  onAddSite?: (pin: LatLon | null) => void;
  handleRef?: Ref<SiteFinderHandle>;
}

const ROWS_PER_PAGE = 20;

// A placed pin's precision, as the site form's own map places one.
const pinOf = (center: LatLon): LatLon => ({
  latitude: Number(center.latitude.toFixed(5)),
  longitude: Number(center.longitude.toFixed(5)),
});

const rowKey = (row: DiveSiteSearchRow) =>
  row.kind === "site"
    ? row.uuid
    : `place:${row.source_id ?? `${row.latitude},${row.longitude}`}`;

const placeTarget = (row: Extract<DiveSiteSearchRow, { kind: "place" }>) =>
  locationTarget({
    name: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    bbox_south: row.bbox_south,
    bbox_north: row.bbox_north,
    bbox_west: row.bbox_west,
    bbox_east: row.bbox_east,
  })!;

/**
 * The site finder: a map of every Commons record and every one of the diver's
 * sites beside a list of sites and places, one search over both. The map's
 * centre is what the list measures from and what each request carries; a pan
 * asks nothing, and offers *Search this area* instead.
 *
 * Owns the search, the camera and the list; the host owns where it opens, the
 * filters, and what a pick, a row's menu and adding a site do.
 */
export function SiteFinder({
  enabled,
  opening,
  filters,
  onFiltersChange,
  tags,
  onFiltersOpened,
  until,
  hiddenUuids,
  siteHref,
  onPickSite,
  siteMenu,
  onAddSite,
  handleRef,
}: SiteFinderProps) {
  const { toast } = useToast();
  const [state, dispatch] = useReducer(finderReducer, null);
  // Opened once, the moment the host knows where: the opening move is not a pan.
  const [input, setInput] = useState("");
  if (opening !== undefined && state === null) {
    dispatch({ type: "open", opening, term: input.trim() });
  }

  const typing = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (typing.current) clearTimeout(typing.current);
    },
    [],
  );
  // The place search's debounce, slower than a list's own: the geocoder is on
  // this path too, and it answers no faster than one request a second.
  const type = (value: string) => {
    setInput(value);
    if (typing.current) clearTimeout(typing.current);
    typing.current = setTimeout(
      () => dispatch({ type: "search", term: value.trim() }),
      PLACE_SEARCH_DEBOUNCE_MS,
    );
  };

  const [pointsKey, setPointsKey] = useState(0);
  const points = useSiteFinderPoints(enabled, pointsKey);
  const view = useRef<FinderView | null>(null);
  const [highlight, setHighlight] = useState<LatLon | null>(null);
  const [touched, setTouched] = useState<FinderMapPoint | null>(null);
  const [isPanelOpen, setPanelOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationRefused, setLocationRefused] = useState(false);

  const term = state?.term ?? "";
  const sent = state?.sent;
  const { yours, tagUuid, sort, commonsMatch } = filters;
  const fetchRows = useCallback(
    async (
      page: number,
      perPage: number,
    ): Promise<PaginatedResponse<DiveSiteSearchRow>> => {
      const answer = await diveSitesAPI.searchDiveSites(page, perPage, {
        search: term,
        camera: sent?.camera,
        // The diver's whole list ignores the view; the server would too.
        view: yours ? null : sent?.view,
        until,
        yours,
        tagUuid,
        commonsMatch,
        sort,
      });
      return {
        data: answer.rows,
        total_count: answer.total_count ?? 0,
        has_more: answer.has_more,
        page: answer.page,
        items_per_page: answer.items_per_page,
      };
    },
    [term, sent, until, yours, tagUuid, commonsMatch, sort],
  );

  const {
    items,
    isLoading,
    isLoadingMore,
    totalCount,
    isCountNarrowed,
    hasMore,
    loadFailed,
    loadMore,
    reload,
    removeItem,
  } = useInfiniteResource<DiveSiteSearchRow>(fetchRows, {
    keyOf: rowKey,
    itemsPerPage: ROWS_PER_PAGE,
    enabled: enabled && state !== null,
    isNarrowed: term.length > 0 || Boolean(tagUuid) || commonsMatch,
    errorMessage: "Failed to load dive sites. Please try again.",
  });

  useImperativeHandle(
    handleRef,
    () => ({
      reload: () => {
        setPointsKey((key) => key + 1);
        void reload();
      },
      removeSite: (uuid) => {
        setPointsKey((key) => key + 1);
        removeItem(uuid);
      },
    }),
    [reload, removeItem],
  );

  const hidden = new Set(hiddenUuids);
  const rows = items.filter(
    (row) => row.kind !== "site" || !hidden.has(row.uuid),
  );
  const siteCount = rows.filter((row) => row.kind === "site").length;

  const onViewChange = useCallback((next: FinderView, byDiver: boolean) => {
    view.current = next;
    if (byDiver) dispatch({ type: "moved", view: next });
  }, []);

  const pickPlace = (row: Extract<DiveSiteSearchRow, { kind: "place" }>) => {
    if (typing.current) clearTimeout(typing.current);
    setInput("");
    setTouched(null);
    dispatch({ type: "place", target: placeTarget(row) });
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      toast({ title: "This browser cannot say where you are." });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        dispatch({
          type: "locate",
          point: { latitude: coords.latitude, longitude: coords.longitude },
        });
      },
      (error) => {
        setLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          // Said once: a browser that refused keeps refusing without asking.
          if (!locationRefused) {
            toast({
              title: "Location is blocked",
              description:
                "This browser is set not to tell this site where you are, so the map stays where it is.",
            });
          }
          setLocationRefused(true);
          return;
        }
        toast({
          title: "Couldn't find where you are",
          description: "The map stays where it is.",
        });
      },
      { maximumAge: 60_000, timeout: 15_000 },
    );
  };

  const setYours = (on: boolean) =>
    onFiltersChange(on ? { ...filters, yours: true } : NO_FINDER_FILTERS);

  const siteName = (uuid: string, row: DiveSiteSearchItem | null) =>
    siteHref
      ? { href: siteHref(uuid) }
      : { onPick: () => onPickSite?.(uuid, row) };

  const isNarrowed = term.length > 0 || Boolean(tagUuid) || commonsMatch;
  const offersArea = !yours && !!state?.moved;

  return (
    <div className="grid gap-4 max-sm:gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <div
        data-finder-map
        className="relative h-72 overflow-hidden rounded-lg border bg-muted sm:h-96 lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)] lg:max-h-[52rem]"
      >
        <div
          role="region"
          aria-label="Map of dive sites"
          className="absolute inset-0 rounded-[inherit]"
        >
          <SiteFinderMap
            commons={points.commons}
            yours={points.yours}
            yoursOnly={yours}
            target={state?.target ?? null}
            highlight={highlight}
            onViewChange={onViewChange}
            onPointPick={(point) => {
              setTouched(point);
              setHighlight(point);
            }}
          />
        </div>

        {offersArea && (
          <div className="absolute inset-x-0 top-2 z-10 flex justify-center">
            <Button
              type="button"
              size="sm"
              className="shadow"
              onClick={() =>
                view.current && dispatch({ type: "area", view: view.current })
              }
            >
              <Search className="mr-2 h-4 w-4" />
              Search this area
            </Button>
          </div>
        )}

        <div className="absolute right-2 top-2 z-10">
          <IconTooltip label="Use my location">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              disabled={locating}
              onClick={locate}
            >
              <LocateFixed className="h-4 w-4" />
            </Button>
          </IconTooltip>
        </div>

        {onAddSite && (
          <div className="absolute bottom-2 left-2 z-10">
            <IconTooltip label="Add a dive site at the map's centre">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shadow"
                // No pin while the map rests, unmoved, on the world it opened
                // on: its centre there is nowhere the diver pointed.
                onClick={() =>
                  onAddSite(
                    state?.camera && view.current
                      ? pinOf(view.current.center)
                      : null,
                  )
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                Add a site here
              </Button>
            </IconTooltip>
          </div>
        )}

        <MapCredit className="absolute bottom-0 right-0 z-10" />
      </div>

      <section aria-labelledby="site-finder-list" className="min-w-0 space-y-3">
        <h2 id="site-finder-list" className="sr-only">
          Dive sites and places
        </h2>
        <Card>
          <CardContent className="space-y-3 pt-4 max-sm:p-3">
            <SearchInput
              id="site-finder-search"
              label="Search dive sites and places by name"
              placeholder="Search sites and places..."
              value={input}
              onChange={type}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch checked={yours} onCheckedChange={setYours} />
                Your sites
              </label>
              {yours && (
                <>
                  <CountBadge
                    count={totalCount}
                    isLoading={isLoading}
                    label="dive site"
                    total
                    isNarrowed={isCountNarrowed}
                  />
                  <ListFiltersButton
                    className="ml-auto"
                    controls="site-finder-filters"
                    isOpen={isPanelOpen}
                    onOpenChange={(open) => {
                      if (open) onFiltersOpened?.();
                      setPanelOpen(open);
                    }}
                    onClear={() =>
                      onFiltersChange({ ...filters, ...NO_SITE_FILTERS })
                    }
                    isChanged={siteFiltersChanged(filters)}
                    label="Filter and sort your dive sites"
                  />
                </>
              )}
            </div>
            {yours && (
              <div id="site-finder-filters" hidden={!isPanelOpen}>
                <SitesFilters
                  filters={{ tagUuid, sort }}
                  onFiltersChange={(next) =>
                    onFiltersChange({ ...filters, ...next })
                  }
                  tags={tags}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {touched && (
          <div
            className="relative rounded-md border border-coral bg-card p-3 text-sm"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs text-muted-foreground">On the map</p>
                <TouchedName
                  point={touched}
                  {...siteName(touched.uuid, null)}
                />
                {isCommonsSite(touched) && (
                  <div className="flex flex-wrap items-center gap-2">
                    <CommonsBadge />
                    <CommonsCredit attribution={touched.credit} />
                  </div>
                )}
              </div>
              <IconTooltip label="Close">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setTouched(null);
                    setHighlight(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </IconTooltip>
            </div>
          </div>
        )}

        {isLoading ? (
          <ListRowsSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {isNarrowed
              ? yours
                ? "None of your dive sites match that."
                : "No dive sites or places match that name."
              : yours
                ? "You have no dive sites yet."
                : sent?.camera
                  ? "No dive sites with a pin near here yet."
                  : "You have no dive sites yet. Search for one by name, or move the map."}
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) =>
              row.kind === "site" ? (
                <SiteRow
                  key={rowKey(row)}
                  site={row}
                  {...siteName(row.uuid, row)}
                  menu={yours ? siteMenu?.(row) : undefined}
                  onPoint={setHighlight}
                  isCurrent={touched?.uuid === row.uuid}
                />
              ) : (
                <PlaceRow
                  key={rowKey(row)}
                  place={row}
                  onPick={() => pickPlace(row)}
                />
              ),
            )}
          </ul>
        )}

        <LoadMoreTrigger
          hasMore={hasMore}
          isLoading={isLoadingMore}
          hasFailed={loadFailed}
          loadedCount={siteCount}
          totalCount={yours ? totalCount : null}
          itemsPerPage={ROWS_PER_PAGE}
          itemLabel="dive sites"
          onLoadMore={loadMore}
        />
      </section>
    </div>
  );
}

function TouchedName({
  point,
  href,
  onPick,
}: {
  point: FinderMapPoint;
  href?: string;
  onPick?: () => void;
}) {
  const className = "font-medium text-foreground underline underline-offset-2";
  return href ? (
    <Link href={href} className={className}>
      {point.name}
    </Link>
  ) : (
    <button type="button" onClick={onPick} className={className}>
      {point.name}
    </button>
  );
}
