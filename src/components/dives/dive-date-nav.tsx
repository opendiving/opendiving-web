"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { divesAPI, DiveNeighbor, DiveNeighbors } from "@/lib/api/dives";
import { formatDiveDateTime, formatDiveStartTime } from "@/lib/date-time";
import { cn } from "@/lib/utils";

export interface DiveDateNavProps {
  diveUuid: string;
  // The dive's own `start_time`, already on the page - so the line renders in
  // full on the first paint and the arrows fill in around it.
  startTime: string;
}

// What the arrow's tooltip and accessible name say about where it goes. The
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
 * The dive detail page's subtitle line: the dive's date and clock time with a
 * step-back and step-forward control around it.
 *
 * Chronological, not list-order - `<` is the earlier dive and `>` the later one,
 * so a trip reads front to back however the log page happens to be sorted. See
 * `DiveNeighbors` for why that is the opposite of `getDives`' ordering.
 *
 * An end of the log leaves its arrow disabled rather than dropping it, so the
 * date doesn't slide sideways as a diver steps onto the oldest dive - and so the
 * end of the log is visible instead of merely being where clicking stops.
 */
export function DiveDateNav({ diveUuid, startTime }: DiveDateNavProps) {
  // Keyed by the uuid they were fetched for. Navigating between two dives keeps
  // this component mounted with a new `diveUuid`, and a plain `neighbors` state
  // would spend that render pointing the arrows at the previous dive's
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
        // Silent, and both arrows stay disabled. This is a shortcut to the rest
        // of the log, not part of the dive the diver came to read, and a toast
        // over the top of a page that loaded fine would say otherwise.
        console.error("Failed to load neighbouring dives:", error);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [diveUuid]);

  const neighbors = loaded?.diveUuid === diveUuid ? loaded.neighbors : null;
  // "Not yet known" rather than "not there". Both render the same dead arrow, but
  // a screen reader following a step would otherwise hear the end of the log every
  // time - the arrow's name and `aria-disabled` flip on each one - with no way to
  // tell that from actually having reached the oldest dive.
  const isPending = loaded?.diveUuid !== diveUuid;

  // Inline flow rather than a flex row, so the arrows travel with the text. As a
  // flex row the date is one item that stretches to the full width of the line
  // before wrapping, which parks `>` against the right edge of the header on a
  // phone - a chevron floating a screen-width away from the date it belongs to.
  // Inline, it simply follows the last word onto whatever line that word lands on.
  return (
    <span>
      <NavArrow
        direction="previous"
        neighbor={neighbors?.previous ?? null}
        isPending={isPending}
        // Pulls the chevron's own padding back off the left edge so the date
        // line still starts under the dive number above it.
        className="-ml-1.5"
      />
      {formatDiveStartTime(startTime)}
      <NavArrow
        direction="next"
        neighbor={neighbors?.next ?? null}
        isPending={isPending}
      />
    </span>
  );
}

interface NavArrowProps {
  direction: "previous" | "next";
  neighbor: DiveNeighbor | null;
  // Whether `neighbor` being null means "still loading" rather than "end of log".
  isPending: boolean;
  className?: string;
}

/**
 * One chevron. Always the same `<a>`, whether or not it currently leads anywhere.
 *
 * That is the whole reason this doesn't use `next/link` and drive the unavailable
 * state with `disabled`, which is the obvious build. `<Link>` and a bare `<a>` are
 * different element types to React, so alternating between them - which every step
 * does, since arriving at a dive nulls the neighbours until the next fetch lands -
 * replaces the DOM node. The browser drops focus when the focused node goes, so a
 * keyboard diver pressing Enter on `>` landed on the next dive with focus on
 * `<body>` and had to tab all the way back for every single step. `disabled` on a
 * focused button costs the same thing.
 *
 * One node that keeps its `tabIndex` and swaps its `href` survives all of it, at
 * the price of re-doing the two things `<Link>` was doing: pushing the route on a
 * plain click, and staying out of the way of a modified one so cmd-click still
 * opens a dive in a new tab.
 */
function NavArrow({
  direction,
  neighbor,
  isPending,
  className,
}: NavArrowProps) {
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
      variant="ghost"
      size="icon"
      className={cn(
        // `align-middle` because an inline-flex box baselines on its bottom
        // edge, which would hang the chevron below the text it sits beside.
        "h-7 w-7 shrink-0 align-middle",
        // Matches `Button`'s own `disabled:` styling, since `aria-disabled` is
        // what stands in for `disabled` here.
        !href && "pointer-events-none opacity-50",
        className,
      )}
      asChild
    >
      <a
        href={href}
        // Focusable even with nothing to point at - the point of the exercise.
        tabIndex={0}
        // An `<a>` with no `href` is `generic` to the accessibility tree, not a
        // link, and a generic node carries no accessible name - so without this
        // the unavailable arrow would stop announcing itself entirely rather
        // than announcing itself as unavailable.
        role="link"
        aria-disabled={!href}
        aria-busy={isPending}
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
        <Chevron className="h-4 w-4" />
      </a>
    </Button>
  );
}
