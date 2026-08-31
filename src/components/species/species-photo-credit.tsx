"use client";

import { Species } from "@/lib/api/species";

/**
 * The photo's credit, composed from the parts the API stores.
 *
 * **This is the element that makes the whole feature licence-clean, so it is an
 * invariant rather than a detail: every rendered species photo either carries a
 * visible credit beside it, or is a link to a page that does.** The thumbnails on
 * the dive card and the life list take the second route, which both generations
 * of the Creative Commons licences allow - 4.0 says outright that attribution may
 * be satisfied by a hyperlink to a resource carrying it, and the 3.0-and-earlier
 * files rest on the same idea through "reasonable to the medium". This page is
 * that resource, which is why it is a page and not a tooltip.
 *
 * A tooltip would not do: it is invisible by default, absent on touch, and not
 * announced to screen readers - the hidden-metadata pattern Creative Commons'
 * own attribution guidance warns against. So this renders as plain visible text,
 * and must survive a narrow viewport rather than being dropped by a responsive
 * rule.
 *
 * Two hyperlinks, which is why the API stores parts rather than one ready-made
 * string: the licence link and the source link are both required and a single
 * string can carry at most one of them. Every part is independently null - a
 * photo whose author Commons did not record is a real state - so each is rendered
 * only when it is there, and the whole block disappears when there is no photo.
 *
 * Nothing here is markup. `photo_author` is parsed out of Commons' HTML `Artist`
 * field by the API and arrives as plain text; it is interpolated as a text node
 * like everything else, never as HTML.
 */
export function SpeciesPhotoCredit({ species }: { species: Species }) {
  if (!species.photo_sha256) return null;

  const {
    photo_author: author,
    photo_license: license,
    photo_license_url: licenseUrl,
    photo_source_url: sourceUrl,
    photo_file: file,
  } = species;

  // Nothing at all was recorded alongside the bytes. Rare, but a credit line
  // reading "Photo:" with nothing after it is worse than no line.
  if (!author && !license && !sourceUrl) return null;

  return (
    <p className="text-xs text-muted-foreground">
      Photo{author ? ` by ${author}` : ""}
      {license && (
        <>
          {" · "}
          {licenseUrl ? (
            <a
              href={licenseUrl}
              target="_blank"
              rel="noopener noreferrer license"
              className="underline hover:text-foreground"
            >
              {license}
            </a>
          ) : (
            license
          )}
        </>
      )}
      {sourceUrl && (
        <>
          {" · "}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
            // The file title rather than "Wikimedia Commons": two links a few
            // words apart both reading the same thing tell a screen reader's
            // link list nothing about which file each one points at.
            title={file ?? undefined}
          >
            Wikimedia Commons
          </a>
        </>
      )}
    </p>
  );
}
