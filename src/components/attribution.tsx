"use client";

import { useMemo } from "react";
import { parseAttribution } from "@/lib/map-tiles";

interface AttributionProps {
  /**
   * The credit as whoever produced the data wrote it - plain text, or with the
   * part that should link written as `[label](href)`.
   */
  value: string;
}

/**
 * A licence credit, with whatever link it carries made followable.
 *
 * Inline elements only, and no styling of its own: the four places this appears
 * frame it differently - a chip over a map's corner, a line of fine print under
 * a form field - and the only thing they agree on is what the string means.
 *
 * Extracted at the fourth copy. Both maps had already written this loop out by
 * hand, and the two geocoder credits needed it once the API began sending the
 * licence URL as a markdown link rather than as bare text - at which point
 * rendering the string raw stops being merely unhelpful and starts showing
 * `[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)`
 * to a diver.
 *
 * Parsing rather than trusting is `parseAttribution`'s job and is why this
 * takes a string rather than parts: the value reaches us from an environment
 * variable or from whatever `GEOCODER_URL` points at, `react/no-danger` is an
 * error in this repo, and a credit line is exactly the sort of "it's only
 * markup" HTML that gets waved through.
 */
export function Attribution({ value }: AttributionProps) {
  const parts = useMemo(() => parseAttribution(value), [value]);

  return (
    <>
      {parts.map((part, index) =>
        part.href ? (
          <a
            key={index}
            href={part.href}
            // Not decoration: these appear inside dialogs holding a half-filled
            // form, and navigating away in the same tab would throw it away.
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {part.text}
          </a>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
