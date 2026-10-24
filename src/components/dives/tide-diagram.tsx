import { useId } from "react";
import type { ConditionsExtreme, TideState } from "@/lib/api/dives";
import { buildAreaPath, type Point } from "@/lib/chart-path";
import { formatClockAtOffset } from "@/lib/date-time";
import { TIDE_STATE_LABELS } from "@/lib/dive-conditions";

// The drawing's own units, stretched to the card's width: the curve is a shape
// to read the dive's place on, so the height keeps no scale.
const WIDTH = 100;
const HEIGHT = 100;
// How far the curve runs on past each turn, as a share of the time between the
// two, so each reads as a turn rather than an end. Past them it is the same
// curve continued rather than anything the service answered, so it is fainter.
const OVERRUN = 0.25;
const SAMPLES = 64;

const AT_THE_DIVE: Record<TideState, string> = {
  high: "at high water",
  low: "at low water",
  rising: "on the rising tide",
  falling: "on the falling tide",
};

interface TideDiagramProps {
  previous: ConditionsExtreme;
  next: ConditionsExtreme;
  // The dive's start, and how long it was under in seconds.
  start: string;
  duration: number | null;
  state: TideState | null;
  utcOffsetMinutes: number;
  className?: string;
}

/**
 * The tide around the dive as a half cosine from the turn before it to the turn
 * after, with the dive marked on it where it started and drawn over the stretch
 * it lasted. A half cosine is what an hourly model's tide is between two turns
 * near enough for a shape, and it needs nothing but the two turns' times.
 */
export function TideDiagram({
  previous,
  next,
  start,
  duration,
  state,
  utcOffsetMinutes,
  className,
}: TideDiagramProps) {
  const gradientId = useId();
  const turnFrom = Date.parse(previous.at);
  const turnTo = Date.parse(next.at);
  const half = turnTo - turnFrom;
  const from = turnFrom - half * OVERRUN;
  const to = turnTo + half * OVERRUN;
  const sign = previous.kind === "high" ? 1 : -1;

  const point = (time: number): Point => ({
    x: round(((time - from) / (to - from)) * WIDTH),
    // 10 to 90, so a turn is never drawn against the box's edge.
    y: round(
      HEIGHT / 2 -
        sign * Math.cos((Math.PI * (time - turnFrom)) / half) * HEIGHT * 0.4,
    ),
  });
  const between = (a: number, b: number): Point[] => {
    const steps = Math.max(2, Math.ceil((SAMPLES * (b - a)) / (to - from)));
    return Array.from({ length: steps + 1 }, (_, index) =>
      point(a + ((b - a) * index) / steps),
    );
  };
  const line = (points: Point[]) =>
    points
      .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x},${y}`)
      .join(" ");

  const began = Date.parse(start);
  const ended = Math.min(to, began + (duration ?? 0) * 1000);
  const dive = point(began);

  const clock = (instant: string) =>
    formatClockAtOffset(instant, utcOffsetMinutes);
  const turns = [previous, next].map((turn) => ({
    turn,
    x: point(Date.parse(turn.at)).x,
    clock: clock(turn.at),
  }));
  const description =
    `Tide: ${turns.map(({ turn, clock }) => `${turn.kind} water at ${clock}`).join(", ")}; ` +
    `the dive began at ${clock(start)}${state ? `, ${AT_THE_DIVE[state]}` : ""}`;

  return (
    <div className={className}>
      <p className="text-xs">Tide</p>
      <div role="img" aria-label={description} className="mt-1">
        <div className="relative h-12 text-teal">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            overflow="visible"
            className="absolute inset-0 size-full"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={buildAreaPath(between(from, to), HEIGHT)}
              fill={`url(#${gradientId})`}
            />
            {[
              { key: "before", d: line(between(from, turnFrom)), faint: true },
              { key: "between", d: line(between(turnFrom, turnTo)) },
              { key: "after", d: line(between(turnTo, to)), faint: true },
            ].map(({ key, d, faint }) => (
              <path
                key={key}
                d={d}
                fill="none"
                stroke="currentColor"
                strokeOpacity={faint ? 0.35 : 1}
                strokeWidth={1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {ended > began && (
              <path
                data-testid="tide-dive-span"
                d={line(between(began, ended))}
                fill="none"
                stroke="hsl(var(--foreground))"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          <span
            data-testid="tide-dive-start"
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-card"
            style={{ left: `${dive.x}%`, top: `${dive.y}%` }}
          />
        </div>
        <div className="relative mt-1 h-4 text-xs">
          {turns.map(({ turn, x, clock }) => (
            <span
              key={turn.at}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${x}%` }}
            >
              <span className="text-muted-foreground">
                {TIDE_STATE_LABELS[turn.kind]}
              </span>{" "}
              <span className="font-medium">{clock}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
