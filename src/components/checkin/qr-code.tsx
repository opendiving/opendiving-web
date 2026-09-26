"use client";

import { useMemo } from "react";
import QRCode from "qrcode";

import { cn } from "@/lib/utils";

// The four-module margin the QR specification asks for around the symbol, without
// which a scanner can fail to find its edge against whatever surrounds the page.
const QUIET_ZONE = 4;

/** Each row's dark modules as runs: `[row, first column, length]`. */
export function qrRuns(value: string): { size: number; runs: number[][] } {
  // "M" recovers from about 15% damage, which is plenty for a screen held up to a
  // camera, and keeps a 70-character link at a symbol a phone reads from across a desk.
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const runs: number[][] = [];
  for (let row = 0; row < modules.size; row++) {
    let start = -1;
    for (let col = 0; col <= modules.size; col++) {
      const dark = col < modules.size && modules.get(row, col) === 1;
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) {
        runs.push([row, start, col - start]);
        start = -1;
      }
    }
  }
  return { size: modules.size, runs };
}

// Drawn from the library's matrix rather than from its SVG string, which would need
// `dangerouslySetInnerHTML`: one `<rect>` per run of dark modules in a row. Black on
// white whatever the theme, because that is what every scanner reads - a dark-mode
// inversion is one many of them do not.
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const { size, runs } = useMemo(() => qrRuns(value), [value]);
  const extent = size + QUIET_ZONE * 2;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
      className={cn("rounded-md", className)}
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      {runs.map(([row, col, length]) => (
        <rect
          key={`${row}-${col}`}
          x={col + QUIET_ZONE}
          y={row + QUIET_ZONE}
          width={length}
          height={1}
          fill="#000000"
        />
      ))}
    </svg>
  );
}
