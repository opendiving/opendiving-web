"use client";

import { Button } from "@/components/ui/button";
import type { DiveSiteLookupItem } from "@/lib/api/dive-sites";

export interface CommonsSiteOfferProps {
  /** The picked row; nothing is shown without one. */
  site: DiveSiteLookupItem | null;
  disabled?: boolean;
  onTake: (uuid: string) => void;
}

// The Commons record a diver picked while making a new site. Taking it saves that
// record to their sites and makes nothing; a row they do not take changes nothing,
// since no form is ever filled from a Commons record.
//
// Mounted whether or not there is an offer, and `sr-only` - out of flow - while
// empty, for `FormApiError`'s reason: a live region inserted with its text is not
// announced.
export function CommonsSiteOffer({
  site,
  disabled,
  onTake,
}: CommonsSiteOfferProps) {
  return (
    <div
      role="status"
      className={
        site ? "space-y-2 rounded-md border bg-muted/40 p-3 text-sm" : "sr-only"
      }
    >
      {site && (
        <>
          <p>
            <strong>{site.name}</strong> is in OpenDiving Commons. Use it, and
            your notes, tags and dives there stay yours.
          </p>
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={() => onTake(site.uuid)}
          >
            Use {site.name}
          </Button>
        </>
      )}
    </div>
  );
}
