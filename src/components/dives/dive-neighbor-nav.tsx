"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { divesAPI, DiveNeighbor, DiveNeighbors } from "@/lib/api/dives";
import { formatDiveDateTime } from "@/lib/date-time";
import { cn } from "@/lib/utils";

export interface DiveNeighborNavProps {
  diveUuid: string;
}

// What the button's tooltip and accessible name say about where it goes. The
// neighbour's own date, not "older"/"newer": a diver skimming a trip knows the
// dive they want by its day, and `#212` alone is ambiguous in a log with
// duplicate numbers - which the numbering summary exists precisely because
// logs have.
function neighborLabel(
  label: "Previous dive" | "Next dive",
  neighbor: DiveNeighbor,
): string {
  const date = formatDiveDateTime(neighbor.start_time, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `${label}: #${neighbor.dive_number}, ${date}`;
}

/**
 * The dive detail page's pager: one step back and one step forward through the
 * log, sitting opposite the "Back to Dives" link in the page header.
 *
 * Chronological, not list-order - "Previous" is the earlier dive and "Next" the
 * later one, so a trip reads front to back however the log page happens to be
 * sorted. See `DiveNeighbors` for why that is the opposite of `getDives`'
 * ordering.
 *
 * The two labels are fixed words and never the neighbour's date. This is a
 * control a diver clicks repeatedly, and a label that emptied and refilled with
 * each step's fetch would resize the button under their cursor between two
 * clicks. The date rides the accessible name and the tooltip instead, where it
 * costs no layout.
 *
 * An end of the log leaves its button in place but dead rather than dropping it,
 * so the pair doesn't shift sideways as a diver steps onto the oldest dive - and
 * so the end of the log is visible instead of merely being where clicking stops.
 */
export function DiveNeighborNav({ diveUuid }: DiveNeighborNavProps) {
  // Keyed by the uuid they were fetched for. Navigating between two dives keeps
  // this component mounted with a new `diveUuid`, and a plain `neighbors` state
  // would spend that render pointing the buttons at the previous dive's
  // neighbours - a click landing somewhere the diver didn't aim.
  const [loaded, setLoaded] = useState<{
    diveUuid: string;
    neighbors: DiveNeighbors;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const neighbors = await divesAPI.getDiveNeighbors(diveUuid);
        if (!cancelled) setLoaded({ diveUuid, neighbors });
      } catch (error) {
        // Silent, and both buttons stay dead. This is a shortcut to the rest of
        // the log, not part of the dive the diver came to read, and a toast over
        // the top of a page that loaded fine would say otherwise.
        console.error("Failed to load neighbouring dives:", error);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [diveUuid]);

  const neighbors = loaded?.diveUuid === diveUuid ? loaded.neighbors : null;
  // "Not yet known" rather than "not there". Both render the same dead button, but
  // a screen reader following a step would otherwise hear the end of the log every
  // time - the button's name and `aria-disabled` flip on each one - with no way to
  // tell that from actually having reached the oldest dive.
  const isPending = loaded?.diveUuid !== diveUuid;

  // A landmark, so the pair is announced as one named thing rather than as two
  // loose links in the middle of the header.
  return (
    <nav
      aria-label="Adjacent dives"
      className="flex shrink-0 items-center gap-2"
    >
      <NavLink
        direction="previous"
        neighbor={neighbors?.previous ?? null}
        isPending={isPending}
      />
      <NavLink
        direction="next"
        neighbor={neighbors?.next ?? null}
        isPending={isPending}
      />
    </nav>
  );
}

interface NavLinkProps {
  direction: "previous" | "next";
  neighbor: DiveNeighbor | null;
  // Whether `neighbor` being null means "still loading" rather than "end of log".
  isPending: boolean;
}

/**
 * One step. Always the same `<a>`, whether or not it currently leads anywhere.
 *
 * That is the whole reason this doesn't use `next/link` and drive the unavailable
 * state with `disabled`, which is the obvious build. `<Link>` and a bare `<a>` are
 * different element types to React, so alternating between them - which every step
 * does, since arriving at a dive nulls the neighbours until the next fetch lands -
 * replaces the DOM node. The browser drops focus when the focused node goes, so a
 * keyboard diver pressing Enter on "Next" landed on the next dive with focus on
 * `<body>` and had to tab all the way back for every single step. `disabled` on a
 * focused button costs the same thing.
 *
 * One node that keeps its `tabIndex` and swaps its `href` survives all of it, at
 * the price of re-doing the two things `<Link>` was doing: pushing the route on a
 * plain click, and staying out of the way of a modified one so cmd-click still
 * opens a dive in a new tab.
 */
function NavLink({ direction, neighbor, isPending }: NavLinkProps) {
  const router = useRouter();
  const isPrevious = direction === "previous";
  const Chevron = isPrevious ? ChevronLeft : ChevronRight;
  const fallbackLabel = isPrevious ? "Previous dive" : "Next dive";

  const href = neighbor ? `/dives/${neighbor.uuid}` : undefined;
  const label = neighbor
    ? neighborLabel(fallbackLabel, neighbor)
    : fallbackLabel;

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        // Matches `Button`'s own `disabled:` styling, since `aria-disabled` is
        // what stands in for `disabled` here.
        !href && "pointer-events-none opacity-50",
      )}
      asChild
    >
      <a
        href={href}
        // Focusable even with nothing to point at - the point of the exercise.
        tabIndex={0}
        // An `<a>` with no `href` is `generic` to the accessibility tree, not a
        // link, and a generic node carries no accessible name - so without this
        // the unavailable button would stop announcing itself entirely rather
        // than announcing itself as unavailable.
        role="link"
        aria-disabled={!href}
        aria-busy={isPending}
        // The word on screen is the first word of this, which is what keeps the
        // visible label part of the accessible one.
        aria-label={label}
        title={label}
        onClick={(event) => {
          if (!href) {
            event.preventDefault();
            return;
          }
          // Leave cmd/ctrl/shift/alt-clicks to the browser, so "open in a new
          // tab" still works on what is, after all, a link to a page.
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          router.push(href);
        }}
      >
        {isPrevious && <Chevron className="h-4 w-4 mr-1" />}
        {isPrevious ? "Previous" : "Next"}
        {!isPrevious && <Chevron className="h-4 w-4 ml-1" />}
      </a>
    </Button>
  );
}
