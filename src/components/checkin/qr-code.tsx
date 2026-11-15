"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import {
  MARK_BUBBLES,
  MARK_STROKE,
  qrLayout,
  type QrLayout,
} from "@/components/checkin/qr-layout";

// The four-module margin the QR specification asks for around the symbol, without
// which a scanner can fail to find its edge against whatever surrounds the page.
const QUIET_ZONE = 4;

// Fixed colours rather than theme tokens: a scanner needs this contrast whatever the theme does.
// The light pupil is a deeper coral than the brand's, which washes out on white at small sizes.
const LIGHT = { ink: "#0B1B2B", pupil: "#E2582D" };
const DARK = { ink: "#E9EFF4", pupil: "#3CC6C0" };
const CORAL = "#FF7F50";

function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  return `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - 2 * r}a${r},${r} 0 0 1 -${r},-${r}v-${h - 2 * r}a${r},${r} 0 0 1 ${r},-${r}z`;
}

// One module whose corner rounds only where neither neighbour beside that corner is drawn, so
// runs and blocks of modules read as single soft shapes.
function fluidModule(drawn: QrLayout["drawn"], row: number, col: number) {
  const up = drawn(row - 1, col);
  const down = drawn(row + 1, col);
  const left = drawn(row, col - 1);
  const right = drawn(row, col + 1);
  const r = 0.5;
  const tl = !up && !left ? r : 0;
  const tr = !up && !right ? r : 0;
  const br = !down && !right ? r : 0;
  const bl = !down && !left ? r : 0;
  const x = col + QUIET_ZONE;
  const y = row + QUIET_ZONE;
  return (
    `M${x + tl},${y}H${x + 1 - tr}` +
    (tr ? `A${tr},${tr} 0 0 1 ${x + 1},${y + tr}` : "") +
    `V${y + 1 - br}` +
    (br ? `A${br},${br} 0 0 1 ${x + 1 - br},${y + 1}` : "") +
    `H${x + bl}` +
    (bl ? `A${bl},${bl} 0 0 1 ${x},${y + 1 - bl}` : "") +
    `V${y + tl}` +
    (tl ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : "") +
    "Z"
  );
}

function dotModule(row: number, col: number) {
  const r = 0.44;
  const cx = col + QUIET_ZONE + 0.5;
  const cy = row + QUIET_ZONE + 0.5;
  return `M${cx - r},${cy}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 -${2 * r},0`;
}

function modulesPath(
  layout: QrLayout,
  draw: (row: number, col: number) => string,
) {
  let d = "";
  for (let row = 0; row < layout.size; row++) {
    for (let col = 0; col < layout.size; col++) {
      if (layout.drawn(row, col)) d += draw(row, col);
    }
  }
  return d;
}

// The finders and alignment patterns, drawn whole: a scanner locates the symbol by their
// 1:1:3:1:1 and 1:1:1 rings, which dots or merged shapes would break up.
function Patterns({
  layout,
  ink,
  pupil,
}: {
  layout: QrLayout;
  ink: string;
  pupil: string;
}) {
  return (
    <>
      {layout.finders.map(([row, col]) => {
        const x = col + QUIET_ZONE;
        const y = row + QUIET_ZONE;
        return (
          <g key={`f${row}-${col}`}>
            <path
              d={
                roundedRect(x, y, 7, 7, 2.3) +
                roundedRect(x + 1, y + 1, 5, 5, 1.5)
              }
              fill={ink}
              fillRule="evenodd"
            />
            <path d={roundedRect(x + 2, y + 2, 3, 3, 1)} fill={pupil} />
          </g>
        );
      })}
      {layout.alignments.map(([row, col]) => {
        const x = col - 2 + QUIET_ZONE;
        const y = row - 2 + QUIET_ZONE;
        return (
          <g key={`a${row}-${col}`} fill={ink}>
            <path
              d={
                roundedRect(x, y, 5, 5, 1.5) +
                roundedRect(x + 1, y + 1, 3, 3, 0.9)
              }
              fillRule="evenodd"
            />
            <circle cx={x + 2.5} cy={y + 2.5} r={0.55} />
          </g>
        );
      })}
    </>
  );
}

function Mark({ mark }: { mark: NonNullable<QrLayout["mark"]> }) {
  const origin = mark.offset + QUIET_ZONE;
  return (
    <g
      transform={`translate(${origin},${origin}) scale(${mark.scale})`}
      fill="none"
      stroke={CORAL}
      strokeWidth={MARK_STROKE}
      strokeLinecap="round"
    >
      {MARK_BUBBLES.map(([cx, cy, r], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill={i === 0 ? CORAL : undefined}
        />
      ))}
    </g>
  );
}

// Drawn from the library's matrix rather than from its SVG string, which would need
// `dangerouslySetInnerHTML`. Light theme: dark modules merged into soft shapes on white. Dark
// theme: light dots on the card, an inverted symbol, which iPhone Camera and current Android
// scanners read.
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const layout = useMemo(() => qrLayout(value), [value]);
  const fluid = useMemo(
    () => modulesPath(layout, (r, c) => fluidModule(layout.drawn, r, c)),
    [layout],
  );
  const dots = useMemo(() => modulesPath(layout, dotModule), [layout]);
  const extent = layout.size + QUIET_ZONE * 2;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${extent} ${extent}`}
      className={cn("rounded-md", className)}
    >
      <g className="dark:hidden" data-theme-variant="light">
        <rect width={extent} height={extent} fill="#ffffff" />
        <path d={fluid} fill={LIGHT.ink} />
        <Patterns layout={layout} ink={LIGHT.ink} pupil={LIGHT.pupil} />
      </g>
      <g className="hidden dark:inline" data-theme-variant="dark">
        <rect width={extent} height={extent} fill="hsl(var(--card))" />
        <path d={dots} fill={DARK.ink} />
        <Patterns layout={layout} ink={DARK.ink} pupil={DARK.pupil} />
      </g>
      {layout.mark && <Mark mark={layout.mark} />}
    </svg>
  );
}
