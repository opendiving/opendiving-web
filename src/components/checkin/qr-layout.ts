import QRCode from "qrcode";

// The brand mark's three bubbles, as `Logo` draws them in its 24-unit box: centre and radius.
export const MARK_BUBBLES: readonly (readonly [number, number, number])[] = [
  [5.17, 20.22, 1.78],
  [10.72, 13.56, 2.89],
  [16.83, 5.78, 3.78],
];
export const MARK_STROKE = 2.6;

export interface QrLayout {
  size: number;
  /** Top-left module of each 7x7 finder. */
  finders: [number, number][];
  /** Centre module of each 5x5 alignment pattern. */
  alignments: [number, number][];
  /** Whether a data module is drawn: dark, outside the patterns, and clear of the mark. */
  drawn: (row: number, col: number) => boolean;
  /** Where the mark's 24-unit box lands, in modules; null when the symbol has no room for it. */
  mark: { offset: number; scale: number } | null;
}

// The standard's alignment-pattern table, by formula: a row of centres from 6 to size - 7,
// every pair of them a pattern except the three that would land on a finder.
function alignmentCentres(version: number, size: number): [number, number][] {
  if (version < 2) return [];
  const count = Math.floor(version / 7) + 2;
  const interval =
    size === 145 ? 26 : Math.ceil((size - 13) / (2 * count - 2)) * 2;
  const line = [size - 7];
  for (let i = 1; i < count - 1; i++) line.push(line[i - 1] - interval);
  line.push(6);
  line.reverse();
  const last = line.length - 1;
  const centres: [number, number][] = [];
  line.forEach((row, i) =>
    line.forEach((col, j) => {
      const onFinder =
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0);
      if (!onFinder) centres.push([row, col]);
    }),
  );
  return centres;
}

export function qrLayout(value: string): QrLayout {
  // "M" keeps the flagship's invite and check-in links at version 5, small enough for a phone
  // to read across a desk, and still recovers the modules the mark leaves out.
  const { modules, version } = QRCode.create(value, {
    errorCorrectionLevel: "M",
  });
  const size = modules.size;
  const finders: [number, number][] = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  const alignments = alignmentCentres(version, size);

  const inPattern = (row: number, col: number) =>
    finders.some(
      ([r, c]) => row >= r && row < r + 7 && col >= c && col < c + 7,
    ) ||
    alignments.some(
      ([r, c]) => Math.abs(row - r) <= 2 && Math.abs(col - c) <= 2,
    );

  // From version 7 an alignment pattern sits at the very centre, under where the mark would go,
  // so a link that long goes without it. Otherwise the mark takes about 30% of the width,
  // centred on its painted extent, which is also its box's centre.
  let mark: QrLayout["mark"] = null;
  let cleared: [number, number, number][] = [];
  if (version < 7) {
    let side = Math.round(size * 0.3);
    if (side % 2 === 0) side += 1;
    const inner = side - 1.2;
    const glyph = inner * 0.92;
    const offset = (size - side) / 2 + 0.6 + (inner - glyph) / 2;
    const scale = glyph / 24;
    mark = { offset, scale };
    // Only the modules near a bubble give way, with a gap that keeps the mark legible, so the
    // empty corners of its diagonal keep their data.
    cleared = MARK_BUBBLES.map(([cx, cy, r]) => [
      offset + cx * scale,
      offset + cy * scale,
      (r + MARK_STROKE / 2) * scale + 1.4,
    ]);
  }

  const drawn = (row: number, col: number) =>
    row >= 0 &&
    col >= 0 &&
    row < size &&
    col < size &&
    modules.get(row, col) === 1 &&
    !inPattern(row, col) &&
    !(
      modules.reservedBit[row * size + col] !== 1 &&
      cleared.some(([x, y, r]) => Math.hypot(col + 0.5 - x, row + 0.5 - y) < r)
    );

  return { size, finders, alignments, drawn, mark };
}
