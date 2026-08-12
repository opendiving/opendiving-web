// One figure in the row above a chart: a small uppercase label, and whatever
// says the number underneath it.
//
// Moved here, unchanged, from `gas-use-card.tsx` once a second card wanted the
// same row - the same move `niceDomain`/`axisTicks` and `subscribeToNothing`
// made, and for the same reason. These two cards sit one above the other on the
// dashboard, so "the same shape" is not a nicety here: a stat row whose label
// size or baseline gap drifted by a couple of pixels between them would read as
// a rendering fault.
//
// Deliberately not in `components/ui/`, which is where shadcn's primitives live
// and where anything added is implicitly app-wide. This is the header of a
// chart card, and both of the cards that want it are dives.
export function ChartStat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        {children}
      </div>
    </div>
  );
}
