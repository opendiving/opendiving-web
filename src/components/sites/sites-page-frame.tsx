"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";

export interface SitesPageFrameProps {
  /** Opens the new-site dialog. */
  onNew?: () => void;
  /** Beside the new-site button: where the instance has more for this page. */
  actions?: ReactNode;
  /** Above the finder, for what the diver should know about their sites. */
  notice?: ReactNode;
  /** The finder, which draws its own placeholders while it opens. */
  children?: ReactNode;
}

const noop = () => {};

// Everything /sites draws around the finder, kept apart from the data render so
// the page's first render is this frame.
export function SitesPageFrame({
  onNew = noop,
  actions,
  notice,
  children,
}: SitesPageFrameProps) {
  return (
    <div>
      <IndexHero
        title="Dive Sites"
        description="Find a dive site on the map or by name - yours, and every site in OpenDiving Commons"
        actions={
          <>
            {actions}
            <Button size="sm" onClick={onNew}>
              <Plus className="h-4 w-4 mr-2" />
              New dive site
            </Button>
          </>
        }
      />

      <div className={HERO_BODY}>
        {notice}
        {children}
      </div>
    </div>
  );
}
