"use client";

import { useState } from "react";
import type { DiveProfile } from "@/lib/api/dives";
import { axisTicks, niceDomain } from "@/lib/chart-scale";
import {
  type ChannelSeries,
  PROFILE_CHANNELS,
  buildAreaPath,
  elapsedTicks,
  formatChannelValue,
  gapThreshold,
  nearestSampleIndex,
  segmentByTimeGap,
  toChannelSeries,
  toPressureSeries,
  tooltipVerticalAnchor,
} from "@/lib/dive-profile";
import {
  formatDurationForForm,
  formatDurationHoursMinutes,
} from "@/lib/date-time";

// Hand-rolled SVG rather than a charting library. The app ships a strict
// nonce-based CSP (`src/proxy.ts`): inline style *attributes* are allowed, but a
// library that injects a `<style>` element - which the emotion/styled-components
// based ones do - would work in dev and break in production, which is a
// miserable bug to acquire for one chart. Stated here in full rather than
// cross-referenced, because this comment is what stops the next person reaching
// for Recharts.
//
// Three channels, three colors, all of them theme-stable tokens declared once in
// `globals.css` and never redeclared under `.dark` (see the note on `--pressure`
// there). `--primary` would not do: it is near-black in light mode and a mid
// grey in dark, which left the gas chart's trend line barely visible.

// The viewBox coordinate space. Not pixels: the SVG scales to its container, so
// these are only ever ratios to each other.
const WIDTH = 720;
const HEIGHT = 280;
// Wider on both sides than the gas chart: depth is on the left and temperature
// and pressure share the right, so both margins carry axis labels.
const PADDING = { top: 14, right: 46, bottom: 28, left: 44 };

const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

export interface DiveProfileChartProps {
  profile: DiveProfile;
}

interface PlottedChannel {
  key: string;
  label: string;
  series: ChannelSeries;
  // Display value -> y coordinate.
  y: (value: number) => number;
  // Runs of consecutive samples, as index arrays - never one polyline across a
  // sensor dropout.
  segments: number[][];
}

export function DiveProfileChart({ profile }: DiveProfileChartProps) {
  // One hovered *time*, not one hovered sample, and one piece of state for the
  // whole chart - the same call `GasUseChart` makes, for the same reason. It
  // can't be an index here: the channels are independently sampled and don't
  // share a time axis, so "the sample under the cursor" is a different index per
  // channel. The cursor's x maps to seconds once, and each channel resolves its
  // own nearest sample from that (`nearestSampleIndex`).
  const [hoveredSeconds, setHoveredSeconds] = useState<number | null>(null);

  const depth = toChannelSeries(profile, "depth");
  const temperature = toChannelSeries(profile, "temperature");
  const pressure = toPressureSeries(profile);

  const duration = profile.duration_seconds;
  const x = (seconds: number) =>
    PADDING.left + (duration > 0 ? seconds / duration : 0) * PLOT_WIDTH;

  // Rebuilt every render rather than memoized: the series are already capped at
  // 1 200 points per channel server-side, so this is a few thousand arithmetic
  // operations - and every input to it is a fresh object derived from `profile`,
  // which would make a `useMemo` dependency list either a lie or a no-op.
  const channels: PlottedChannel[] = (() => {
    const plotted: PlottedChannel[] = [];

    if (depth) {
      // Anchored at the surface and inverted: `0` at the top, deeper further
      // down. `niceDomain` lands on 0 by arithmetic once the surface is in the
      // values (`Math.floor(0 / step) * step` is 0), so there's no special case
      // and no `zeroBased` flag.
      const domain = niceDomain([0, ...depth.values]);
      plotted.push({
        key: "depth",
        label: PROFILE_CHANNELS.depth.label,
        series: depth,
        y: (value) =>
          PADDING.top + ((value - domain.min) / (domain.max - domain.min)) * PLOT_HEIGHT,
        segments: segmentByTimeGap(depth.t, gapThreshold(depth.t)),
      });
    }

    if (temperature) {
      // Its own domain, not shared with depth: a 21.6-21.9 °C range - which is
      // what a whole dive's temperature usually spans - would be a flat line on
      // any axis wide enough for depth.
      const domain = niceDomain(temperature.values);
      plotted.push({
        key: "temperature",
        label: PROFILE_CHANNELS.temperature.label,
        series: temperature,
        y: (value) =>
          PADDING.top +
          (1 - (value - domain.min) / (domain.max - domain.min)) * PLOT_HEIGHT,
        segments: segmentByTimeGap(temperature.t, gapThreshold(temperature.t)),
      });
    }

    if (pressure.length > 0) {
      // One domain across every cylinder, unlike the channels above: two tanks
      // on one dive are directly comparable, and giving each its own axis would
      // make a 50-bar stage look like the 200-bar back gas.
      const domain = niceDomain(pressure.flatMap((cylinder) => cylinder.values));
      for (const cylinder of pressure) {
        plotted.push({
          key: `pressure-${cylinder.gasNumber}`,
          label:
            pressure.length > 1
              ? `${PROFILE_CHANNELS.pressure.label} (gas ${cylinder.gasNumber})`
              : PROFILE_CHANNELS.pressure.label,
          series: cylinder,
          y: (value) =>
            PADDING.top +
            (1 - (value - domain.min) / (domain.max - domain.min)) * PLOT_HEIGHT,
          segments: segmentByTimeGap(cylinder.t, gapThreshold(cylinder.t)),
        });
      }
    }

    return plotted;
  })();

  if (channels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This dive&apos;s imported file recorded no samples to plot.
      </p>
    );
  }

  // Gridlines come from whichever axis is drawn on the left, so the horizontal
  // rules always line up with a labelled value rather than floating between two.
  const leftChannel = channels.find((channel) => channel.key === "depth");
  const rightChannel = channels.find((channel) => channel.key === "temperature");
  const leftDomain = leftChannel ? niceDomain([0, ...leftChannel.series.values]) : null;
  const rightDomain = rightChannel ? niceDomain(rightChannel.series.values) : null;

  const depthArea =
    leftChannel &&
    buildAreaPath(
      leftChannel.series.t.map((seconds, index) => ({
        x: x(seconds),
        y: leftChannel.y(leftChannel.series.values[index]),
      })),
      PADDING.top,
    );

  // One binary search per channel, not one shared index lookup: the channels are
  // independently sampled, so each has its own nearest sample to the cursor's
  // instant. Every reported value is a real reading, never an interpolation.
  const readouts: Readout[] =
    hoveredSeconds === null
      ? []
      : channels
          .map((channel): Readout | null => {
            const index = nearestSampleIndex(channel.series.t, hoveredSeconds);
            if (index < 0) return null;
            return {
              key: channel.key,
              label: channel.label,
              channel: channel.series.channel,
              seconds: channel.series.t[index],
              value: channel.series.values[index],
              cy: channel.y(channel.series.values[index]),
            };
          })
          .filter((readout): readout is Readout => readout !== null);

  return (
    // Wide content scrolls in its own container rather than shrinking the whole
    // chart to phone width, where three axes' labels would become unreadable -
    // the same treatment the gas chart and the gas mixtures table get.
    <div className="overflow-x-auto">
      {/* Sized to exactly the chart, and the positioning context the tooltip's
          percentage offsets are resolved against. */}
      <div className="relative min-w-[560px]">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto"
          role="img"
          aria-label={describeProfile(depth, temperature, pressure, duration)}
        >
          {/* Horizontal gridlines and the left (depth) scale. `currentColor`
              throughout, so light/dark is inherited from the surrounding text
              colors rather than hardcoded per theme. */}
          {leftDomain &&
            leftChannel &&
            axisTicks(leftDomain).map((tick) => (
              <g key={tick} className="text-border">
                <line
                  x1={PADDING.left}
                  x2={WIDTH - PADDING.right}
                  y1={leftChannel.y(tick)}
                  y2={leftChannel.y(tick)}
                  stroke="currentColor"
                  strokeWidth={1}
                />
                <text
                  x={PADDING.left - 6}
                  y={leftChannel.y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="currentColor"
                  className={PROFILE_CHANNELS.depth.colorClass}
                >
                  {tick}
                </text>
              </g>
            ))}

          {/* The right axis is labelled for temperature, the channel most worth
              reading a value off. Pressure shares the side but not the labels:
              three sets of numbers on one edge is unreadable, and the tooltip
              gives the exact figure for any instant. */}
          {rightDomain &&
            rightChannel &&
            axisTicks(rightDomain).map((tick) => (
              <text
                key={tick}
                x={WIDTH - PADDING.right + 6}
                y={rightChannel.y(tick)}
                textAnchor="start"
                dominantBaseline="middle"
                fontSize={11}
                fill="currentColor"
                className={PROFILE_CHANNELS.temperature.colorClass}
              >
                {tick}
              </text>
            ))}

          {elapsedTicks(duration).map((tick) => (
            <text
              key={tick}
              x={x(tick)}
              y={HEIGHT - 8}
              textAnchor="middle"
              fontSize={11}
              fill="currentColor"
              className="text-muted-foreground"
            >
              {formatDurationForForm(tick)}
            </text>
          ))}

          {/* Depth is the chart's subject, so it gets a filled area under the
              curve - which also makes "which side is the water" unambiguous on
              an inverted axis - and everything else is a thin line on top. */}
          {depthArea && (
            <path
              d={depthArea}
              fill="currentColor"
              className={`${PROFILE_CHANNELS.depth.colorClass} opacity-15`}
            />
          )}

          {channels.map((channel) => (
            <g key={channel.key} className={channel.series.channel.colorClass}>
              {channel.segments.map((segment, index) => (
                <polyline
                  key={index}
                  points={segment
                    .map(
                      (position) =>
                        `${x(channel.series.t[position])},${channel.y(channel.series.values[position])}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={channel.key === "depth" ? 2 : 1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
            </g>
          ))}

          {hoveredSeconds !== null && (
            <line
              x1={x(hoveredSeconds)}
              x2={x(hoveredSeconds)}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              stroke="currentColor"
              strokeWidth={1}
              className="text-muted-foreground"
            />
          )}

          {readouts.map((readout) => (
            <circle
              key={readout.key}
              cx={x(readout.seconds)}
              cy={readout.cy}
              r={3.5}
              fill="currentColor"
              className={readout.channel.colorClass}
            />
          ))}

          {/* One transparent hit target over the whole plot. The gas chart hangs
              its hover off per-dot `<a>` elements; a continuous line has no dots
              to hang anything off, so the analogue is a rect that turns the
              cursor's x into a time. `transparent` rather than `none` -
              `fill="none"` takes no pointer events at all, which is the opposite
              of the point.

              Keyboard scrubbing is deliberately out of scope: the gas chart gets
              focus for free from the links its dots already are, and there is no
              equivalent here without inventing a focus model for a polyline. The
              `aria-label` above carries the summary instead. */}
          <rect
            x={PADDING.left}
            y={PADDING.top}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            fill="transparent"
            onMouseMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - bounds.left) / bounds.width;
              setHoveredSeconds(
                Math.min(duration, Math.max(0, ratio * duration)),
              );
            }}
            onMouseLeave={() => setHoveredSeconds(null)}
          />
        </svg>

        {hoveredSeconds !== null && readouts.length > 0 && (
          <ProfileTooltip
            seconds={hoveredSeconds}
            readouts={readouts}
            cx={x(hoveredSeconds)}
            // The topmost of the dots being described, which is only used to
            // decide which end of the plot the card sits at - see
            // `tooltipVerticalAnchor`.
            topmostY={Math.min(...readouts.map((readout) => readout.cy))}
          />
        )}
      </div>

      <Legend channels={channels} />
    </div>
  );
}

interface Readout {
  key: string;
  label: string;
  channel: (typeof PROFILE_CHANNELS)[keyof typeof PROFILE_CHANNELS];
  seconds: number;
  value: number;
  cy: number;
}

// The hover card: HTML rather than SVG `<text>`, so it gets the app's tooltip
// tokens, a border, a shadow and crisp text at any chart width - the same call,
// and the same tokens, as `GasUseTooltip`.
//
// Positioned in percentages of the chart box, which works because the SVG scales
// uniformly inside a wrapper of exactly its size, so viewBox units map straight
// onto percentages without measuring anything in the DOM. The `style` prop is an
// inline style *attribute*, which the CSP allows (`style-src-attr
// 'unsafe-inline'`); an injected `<style>` element would not be.
function ProfileTooltip({
  seconds,
  readouts,
  cx,
  topmostY,
}: {
  seconds: number;
  readouts: Readout[];
  cx: number;
  topmostY: number;
}) {
  // The card always lands inside the chart box, in both axes. It has to: the
  // scroll container around it clips (setting `overflow-x` to `auto` makes
  // `overflow-y` compute to `auto` as well), so anything hanging past an edge is
  // cut off or adds a stray scrollbar.
  //
  // Vertically that is guaranteed by anchoring to the plot's own top or bottom
  // edge rather than offsetting from a data point - see `tooltipVerticalAnchor`
  // for why offsetting from a point cannot be made safe here. Horizontally the
  // card is centred on the crosshair and flips to hug whichever edge it is near,
  // which is safe because its width is bounded by `whitespace-nowrap` on short
  // readouts.
  const { y, translateY } = tooltipVerticalAnchor(
    topmostY,
    PADDING.top,
    HEIGHT - PADDING.bottom,
  );
  const translateX =
    cx < WIDTH * 0.2
      ? "-12px"
      : cx > WIDTH * 0.8
        ? "calc(-100% + 12px)"
        : "-50%";

  return (
    <div
      // Never a hover target itself - it sits over the plot, and letting it take
      // the pointer would make it flicker as it steals its own trigger's hover.
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-white/10 bg-tooltip px-3 py-2 text-tooltip-foreground shadow-lg"
      style={{
        left: `${(cx / WIDTH) * 100}%`,
        top: `${(y / HEIGHT) * 100}%`,
        transform: `translate(${translateX}, ${translateY})`,
      }}
      role="presentation"
    >
      <div className="text-xs text-tooltip-foreground/70">
        {formatDurationForForm(Math.round(seconds))} elapsed
      </div>
      {readouts.map((readout) => (
        <div key={readout.key} className="mt-0.5 text-sm">
          <span className={`${readout.channel.colorClass} font-semibold`}>
            {formatChannelValue(readout.value, readout.channel)}
          </span>{" "}
          <span className="text-tooltip-foreground/70">{readout.label}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ channels }: { channels: PlottedChannel[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {channels.map((channel) => (
        <span key={channel.key} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={`inline-block h-0.5 w-4 rounded-full bg-current ${channel.series.channel.colorClass}`}
          />
          {channel.label} ({channel.series.channel.unit})
        </span>
      ))}
    </div>
  );
}

// The chart's accessible name. The visual tooltip says nothing to a screen
// reader, so this has to carry the shape of the dive on its own.
function describeProfile(
  depth: ChannelSeries | null,
  temperature: ChannelSeries | null,
  pressure: { values: number[] }[],
  duration: number,
): string {
  // `formatDurationHoursMinutes` here rather than the axis's `MM:SS`: read aloud,
  // "84:36" is not a length of time, whereas "1h 25min" is. The axis keeps
  // `MM:SS`, which is what a dive profile's elapsed scale conventionally shows.
  const parts = [`Dive profile over ${formatDurationHoursMinutes(duration)}`];

  if (depth) {
    parts.push(
      `maximum depth ${Math.max(...depth.values).toFixed(1)} meters`,
    );
  }
  if (temperature) {
    parts.push(
      `temperature ${Math.min(...temperature.values).toFixed(1)} to ${Math.max(
        ...temperature.values,
      ).toFixed(1)} degrees Celsius`,
    );
  }
  if (pressure.length > 0) {
    const all = pressure.flatMap((cylinder) => cylinder.values);
    parts.push(
      `tank pressure ${Math.max(...all).toFixed(0)} down to ${Math.min(
        ...all,
      ).toFixed(0)} bar`,
    );
  }

  return `${parts.join(", ")}.`;
}
