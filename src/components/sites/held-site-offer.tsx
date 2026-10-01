"use client";

import { Button } from "@/components/ui/button";
import type { DiveSiteSuggestion } from "@/lib/api/dive-site-catalog";

export interface HeldSiteOfferProps {
  /** The picked row, whose `held_site` is offered; nothing is shown without one. */
  suggestion: DiveSiteSuggestion | null;
  disabled?: boolean;
  onTake: (uuid: string) => void;
  onDecline: (suggestion: DiveSiteSuggestion) => void;
}

// The site the diver already has for a catalogue row they picked while making a
// new one. Offered, never forced: taking it uses that site and makes nothing, and
// declining fills the form from the row as any pick does - two sites may carry one
// registry entry. Where the held site still has the row's name at its place, the
// save is refused as a name taken at that location, which says why.
//
// Mounted whether or not there is an offer, and `sr-only` - out of flow - while
// empty, for `FormApiError`'s reason: a live region inserted with its text is not
// announced.
export function HeldSiteOffer({
  suggestion,
  disabled,
  onTake,
  onDecline,
}: HeldSiteOfferProps) {
  const held = suggestion?.held_site;
  return (
    <div
      role="status"
      className={
        held ? "space-y-2 rounded-md border bg-muted/40 p-3 text-sm" : "sr-only"
      }
    >
      {suggestion && held && (
        <>
          <p>
            You already have <strong>{held.name}</strong> for this site.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => onTake(held.uuid)}
            >
              Use {held.name}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onDecline(suggestion)}
            >
              Make a new site
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
