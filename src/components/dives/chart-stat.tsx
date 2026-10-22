"use client";

import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

// One figure in the row above a chart: a small uppercase label, and whatever
// says the number underneath it.
//
// Moved here, unchanged, from `gas-use-card.tsx` once a second card wanted the
// same row - the same move `niceDomain`/`axisTicks` and `subscribeToNothing`
// made, and for the same reason. These two cards sit one above the other on the
// Home page, so "the same shape" is not a nicety here: a stat row whose label
// size or baseline gap drifted by a couple of pixels between them would read as
// a rendering fault.
//
// Deliberately not in `components/ui/`, which is where shadcn's primitives live
// and where anything added is implicitly app-wide. This is the header of a
// chart card, and both of the cards that want it are dives.
//
// `detail` sits beside the figure when the enclosing `ChartStatRow` finds room
// for it, and on its own line under the figure otherwise. It is a grid cell
// rather than a flex item so that, stacked, the stat's width is the wider of
// the two lines rather than their sum - which is what lets a row of three fit
// at phone width.
export function ChartStat({
  label,
  children,
  detail,
}: {
  label: string;
  children: React.ReactNode;
  detail?: React.ReactNode;
}) {
  const figure = (
    <div className="flex flex-wrap items-baseline gap-x-2">{children}</div>
  );

  return (
    <div data-chart-stat={detail ? "detail" : ""}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {detail ? (
        <div className="mt-0.5 grid items-baseline gap-x-2 group-data-[detail=inline]/stats:grid-cols-[auto_auto]">
          {figure}
          <div className="whitespace-nowrap">{detail}</div>
        </div>
      ) : (
        <div className="mt-0.5">{figure}</div>
      )}
    </div>
  );
}

// The flex row of `ChartStat`s, which decides where their details go.
//
// A detail goes inline only when that changes nothing else about the row: no
// stat moves to another line and none wraps inside itself. That depends on the
// rendered widths of every figure in the row, so it is measured rather than
// guessed at with a breakpoint - by laying the row out both ways, before paint,
// on every render and every width change.
//
// Top-aligned, so the labels stay level whichever way a detail lands: a stacked
// one makes its stat a line taller than the rest.
export function ChartStatRow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const row = ref.current;
    if (row) placeDetails(row);
  });

  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    let width = row.clientWidth;
    // Only a width change can change the answer; the height change the answer
    // itself causes must not set this off again.
    const observer = new ResizeObserver(() => {
      if (row.clientWidth === width) return;
      width = row.clientWidth;
      placeDetails(row);
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "group/stats flex flex-wrap items-start gap-x-6 gap-y-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

function placeDetails(row: HTMLElement) {
  const stats = Array.from(
    row.querySelectorAll<HTMLElement>(":scope > [data-chart-stat]"),
  );
  if (!stats.some((stat) => stat.dataset.chartStat === "detail")) return;

  row.dataset.detail = "stacked";
  const stacked = stats.map(measure);
  row.dataset.detail = "inline";
  const inline = stats.map(measure);

  const fits = stats.every((stat, index) => {
    const before = stacked[index];
    const after = inline[index];
    if (after.line !== before.line || after.overflows) return false;
    // A stat with a detail must have saved its line; one without must be
    // exactly as tall as it was, or something in it wrapped.
    return stat.dataset.chartStat === "detail"
      ? after.height < before.height
      : after.height === before.height;
  });
  row.dataset.detail = fits ? "inline" : "stacked";

  function measure(stat: HTMLElement, index: number) {
    return {
      // A flex-wrap item starts a new line exactly when it lands no further
      // right than the item before it, whatever the row's alignment.
      line: stats
        .slice(1, index + 1)
        .filter((item, i) => item.offsetLeft <= stats[i].offsetLeft).length,
      height: stat.offsetHeight,
      overflows: stat.scrollWidth > stat.clientWidth,
    };
  }
}
