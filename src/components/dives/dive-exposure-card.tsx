import type { ReactNode } from "react";
import { Dive } from "@/lib/api/dives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gauge } from "lucide-react";

interface DiveExposureCardProps {
  dive: Dive;
}

// The CNS clock past which a diver is over the accepted single-dive exposure. Not a
// hard physiological edge - the tables it comes from are conservative and individual
// susceptibility varies - which is why passing it is rendered as emphasis on a number
// rather than as a warning sentence. The diver knows what their computer told them;
// this is their log agreeing with it, not advice.
const CNS_LIMIT_PERCENT = 100;

/**
 * Oxygen exposure and surface pressure, as the dive computer recorded them.
 *
 * Renders nothing unless the dive carries at least one of them, which is every dive
 * logged by hand and every dive imported from a format that doesn't record them - a FIT
 * file has no surface pressure at all, and a 2026 Suunto Ocean export has none of the
 * three. Silence is right here, unlike on the gas-consumption card: these are readings
 * the diver never had the option to enter, so an absent card cannot read as something
 * they forgot to fill in.
 *
 * Sits between the mixtures and the gas consumption on the detail page, following that
 * file's ordering rule - the gas that produced this exposure is directly above it.
 *
 * Everything here is displayed exactly as stored, with no derivation at all. That is
 * unusual for this page and deliberate: CNS and OTU are the output of whichever
 * decompression algorithm the device ran, over an exposure history that includes dives
 * this log may not hold, so there is nothing to recompute them from and no way to check
 * them. See the API's DECISIONS.md for why they are import-only columns.
 */
export function DiveExposureCard({ dive }: DiveExposureCardProps) {
  const hasCns = dive.cns_start != null || dive.cns_end != null;
  const hasOtu = dive.otu_start != null || dive.otu_end != null;
  const hasPressure = dive.surface_pressure_bar != null;
  if (!hasCns && !hasOtu && !hasPressure) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          {/* Not "Oxygen Exposure", which is what two of the three readings are:
              42 of the 384 XML exports in the corpus record a surface pressure and
              neither CNS nor OTU, and that card would have been headed "Oxygen
              Exposure" over a lone barometer reading. Gating the card on CNS/OTU
              instead would drop a stored reading for those 42 dives. */}
          Exposure &amp; Pressure
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {hasCns && (
            <Reading
              label="CNS"
              start={dive.cns_start}
              end={dive.cns_end}
              unit="%"
              // Emphasis on the end value only. The start is history the diver
              // arrived with and cannot act on; the end is what they are carrying
              // into the next dive.
              alert={
                dive.cns_end != null && dive.cns_end >= CNS_LIMIT_PERCENT
                  ? `over the ${CNS_LIMIT_PERCENT}% single-dive limit`
                  : undefined
              }
            />
          )}
          {hasOtu && (
            <Reading label="OTU" start={dive.otu_start} end={dive.otu_end} />
          )}
          {hasPressure && (
            <div>
              <ReadingLabel>Surface pressure</ReadingLabel>
              <div className="text-2xl font-bold">
                {dive.surface_pressure_bar} bar
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Shared by the pair readings and the single-valued surface pressure, which are
// laid out differently below the label but have to read as one row of headings.
function ReadingLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm font-medium text-muted-foreground mb-1">
      {children}
    </div>
  );
}

/**
 * One exposure reading as a start → end pair.
 *
 * The pair is the point. A repetitive dive that began at CNS 8 % and ended at 9 %
 * added almost nothing, and one that began at 0 % and ended at 9 % is a different
 * dive with the same final number - which is why both halves are shown rather than
 * just the figure the diver is left carrying.
 *
 * A missing half renders as an em dash rather than collapsing the pair, so the arrow
 * still reads as "from, to" on a format that records only the end (every FIT file
 * does exactly that: the profile has no start-OTU field at all).
 */
function Reading({
  label,
  start,
  end,
  unit = "",
  alert,
}: {
  label: string;
  start: number | null | undefined;
  end: number | null | undefined;
  unit?: string;
  // The reason this reading is emphasized, or absent when it isn't - one prop rather
  // than a boolean plus a message, so a caller cannot light the value up without
  // saying why. Rendered `sr-only`; the colour is the sighted half of the same fact.
  alert?: string;
}) {
  return (
    <div>
      <ReadingLabel>{label}</ReadingLabel>
      <div className="flex items-baseline gap-2">
        <span className="text-muted-foreground">
          {start != null ? `${start}${unit}` : "—"}
        </span>
        {/* Decorative: the accessible name comes from the label above and the two
            values read in order, so announcing "right arrow" between them adds
            nothing. */}
        <span className="text-muted-foreground" aria-hidden>
          →
        </span>
        {/* `text-warning`, not `text-warning-foreground` - the latter is the white
            that sits *on* `bg-warning` and is invisible as text on a card in light
            mode. Same trap as the MOD warnings on the mixtures card. */}
        <span
          className={`text-2xl font-bold ${alert ? "text-warning" : ""}`.trim()}
        >
          {end != null ? `${end}${unit}` : "—"}
          {/* The colour is emphasis, and emphasis alone is not a channel: greyscale,
              red/green-deficient and screen-reader users all get "105%" with nothing
              distinguishing it (WCAG 2.1 SC 1.4.1). An `sr-only` span rather than the
              `AlertTriangle` used elsewhere on this feature, because the card's whole
              argument is that passing this line is emphasis rather than advice - and
              an icon would be visible advice. This says the same thing to a reader
              who cannot see the colour, and nothing to one who can. */}
          {alert && <span className="sr-only"> — {alert}</span>}
        </span>
      </div>
    </div>
  );
}
