"use client";

import { useMemo } from "react";

export interface AttributionPart {
  text: string;
  // Absent for a plain run of text between (or instead of) links.
  href?: string;
}

// `[label](href)`, the one piece of markdown worth supporting here.
const ATTRIBUTION_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/**
 * An attribution string as text runs and links, ready to render as elements.
 *
 * Structured rather than handed over as HTML because `react/no-danger` is an
 * error in this repo, and rightly so: this string comes from an environment
 * variable or from whatever `GEOCODER_URL` points at, and
 * `dangerouslySetInnerHTML` on config is how a self-hoster's typo becomes an
 * injection. Building React nodes from parsed parts keeps the escape hatch shut.
 *
 * Only `http`/`https` links survive. Nothing else is a licence page, and a
 * `javascript:` href reaching an anchor would be an own goal for the sake of a
 * credit line.
 *
 * It lives beside its one consumer rather than in `lib/`. It arrived in the
 * hand-rolled renderer's `lib/map-tiles.ts` because the basemap credit was the
 * first string that needed it, and it outlived that module - but nothing about
 * parsing a credit line is basemap arithmetic, and half of what reaches this
 * component is the geocoder's credit rather than a map's.
 */
export function parseAttribution(value: string): AttributionPart[] {
  const parts: AttributionPart[] = [];
  let index = 0;

  for (const match of value.matchAll(ATTRIBUTION_LINK)) {
    const [whole, text, href] = match;
    const before = value.slice(index, match.index);
    if (before) parts.push({ text: before });

    let safe = false;
    try {
      const { protocol } = new URL(href);
      safe = protocol === "http:" || protocol === "https:";
    } catch {
      safe = false;
    }
    // A link that cannot be followed still has to be *credited*, so the label
    // survives as plain text rather than the whole entry being dropped.
    parts.push(safe ? { text, href } : { text });
    index = match.index + whole.length;
  }

  const rest = value.slice(index);
  if (rest) parts.push({ text: rest });
  return parts;
}

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
 * Parsing rather than trusting is `parseAttribution`'s job above, and is why
 * this takes a string rather than parts: the value reaches us from an
 * environment variable or from whatever `GEOCODER_URL` points at,
 * `react/no-danger` is an error in this repo, and a credit line is exactly the
 * sort of "it's only markup" HTML that gets waved through.
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
