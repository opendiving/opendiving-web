"use client";

import { useRef, useState } from "react";
import { DiveSiteDialog } from "@/components/sites/dive-site-dialog";
import { ProposeSiteDialog } from "@/components/sites/propose-site-dialog";
import { ReplaceWithCommonsDialog } from "@/components/sites/replace-with-commons-dialog";
import type {
  DiveSite,
  DiveSiteCommonsMatch,
  DiveSiteProposal,
} from "@/lib/api/dive-sites";

interface SiteProposalFlowProps {
  // The diver's own site. The flow is open while there is one, and the host gates
  // it: this reads no config.
  site: DiveSite | null;
  onClose: () => void;
  // A save from the review step's Edit. The host passes the saved site back as
  // `site`, which is what the flow carries on with.
  onSaved: (site: DiveSite) => void;
  onProposed?: (proposal: DiveSiteProposal) => void;
  // What a replace does next is the host's call; the site is gone by then.
  onReplaced: (record: DiveSite) => void;
  finalFocus?: React.ComponentProps<typeof ProposeSiteDialog>["finalFocus"];
}

// Everything that can follow a save with Public chosen: the propose dialog, the
// choiceless form its Edit opens and the replace its matches offer. Each host of
// `DiveSiteDialog` mounts it beside the form, bar the header's, which navigates and
// leaves the site page to open it from `useProposeOnArrival`. Leaving any of them
// leaves the site private.
export function SiteProposalFlow({
  site,
  onClose,
  onSaved,
  onProposed,
  onReplaced,
  finalFocus,
}: SiteProposalFlowProps) {
  // Held past the close, so the dialogs have something to fade out with.
  const [shown, setShown] = useState(site);
  if (site && site !== shown) setShown(site);

  const [isEditing, setIsEditing] = useState(false);
  const [target, setTarget] = useState<DiveSiteCommonsMatch | null>(null);
  // The form closes itself after a save, and only that close goes back to the flow.
  const editSaved = useRef(false);

  if (!shown) return null;

  const close = () => {
    setIsEditing(false);
    setTarget(null);
    onClose();
  };

  return (
    <>
      <ProposeSiteDialog
        open={!!site && !isEditing && !target}
        onOpenChange={(open) => !open && close()}
        site={shown}
        onProposed={(proposal) => onProposed?.(proposal)}
        onReplace={setTarget}
        onEdit={() => setIsEditing(true)}
        finalFocus={finalFocus}
      />

      <DiveSiteDialog
        open={!!site && isEditing}
        onOpenChange={(open) => {
          if (open) return;
          if (editSaved.current) editSaved.current = false;
          else close();
        }}
        diveSite={shown}
        offersChoice={false}
        onSaved={(saved) => {
          editSaved.current = true;
          onSaved(saved);
          // The steps remount as the dialog reopens, and read the matches again:
          // a moved pin or a new registry entry can change the answer.
          setIsEditing(false);
        }}
        finalFocus={finalFocus}
      />

      <ReplaceWithCommonsDialog
        site={shown}
        target={site ? target : null}
        onCancel={close}
        onReplaced={(record) => {
          close();
          onReplaced(record);
        }}
        finalFocus={finalFocus}
      />
    </>
  );
}
