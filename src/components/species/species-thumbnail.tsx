"use client";

import { speciesPhotoUrl } from "@/lib/api/species";
import { cn } from "@/lib/utils";

interface SpeciesThumbnailProps {
  uuid: string;
  // The stored photo's digest (`photo_sha256`), or null/undefined when there is
  // none or the caller's record doesn't carry one. It is both "there is one" and
  // which version it is, so a replaced photo lands on a URL the browser has not
  // cached. Both empty cases draw the same empty box - see `SpeciesSummary` for
  // why the two are distinct on the wire and identical here.
  photoSha256: string | null | undefined;
  // Applied to the box, not the image - so a caller sizes the reserved space and
  // gets the same space whether or not a photo exists.
  className?: string;
}

/**
 * A species' photo at thumbnail size, in a box that is always there.
 *
 * **The box is reserved whether or not a photo exists, and nothing is drawn into
 * it when one doesn't** - no frame, no placeholder glyph, no stranded alt text.
 * That is what keeps rows the same height down a table and cards the same height
 * across a grid: a thumbnail is taller than a line of text, so the space is spent
 * either way and a photo-less row that collapsed would be the thing that looked
 * broken.
 *
 * A plain `<img>` rather than `next/image`, and not for the reason
 * `CertificationCardImage` gives: these bytes are public, but their *origin* is
 * only known at build time in a split-origin deployment and is the page's own
 * origin otherwise, so there is no `remotePatterns` entry that could be written
 * for both topologies. The optimizer would have nothing to fetch.
 *
 * `alt=""` is deliberate rather than lazy. Every caller renders this beside the
 * species' own name in the same row or card, so a real alt would make a screen
 * reader read the name twice; an image whose information is already in adjacent
 * text is exactly the decorative case. Callers that link the thumbnail must
 * therefore name that link some other way - see how the dive card does it.
 */
export function SpeciesThumbnail({
  uuid,
  photoSha256,
  className,
}: SpeciesThumbnailProps) {
  const src = speciesPhotoUrl(uuid, photoSha256);

  return (
    <div className={cn("overflow-hidden rounded-md", className)}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      )}
    </div>
  );
}
