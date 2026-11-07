"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormApiError } from "@/components/ui/form-api-error";
import { useToast } from "@/components/ui/use-toast";
import {
  diveSitesAPI,
  type DiveSite,
  type DiveSiteCommonsMatchName,
} from "@/lib/api/dive-sites";
import { getApiErrorMessage } from "@/lib/api/error";

interface ReplaceWithCommonsDialogProps {
  site: DiveSite;
  // The record to replace the site with; the dialog is open while there is one.
  target: DiveSiteCommonsMatchName | null;
  onCancel: () => void;
  onReplaced: (record: DiveSite) => void;
  finalFocus?: React.ComponentProps<typeof ConfirmDialog>["finalFocus"];
}

// Replacing deletes the diver's own site, so it is stated before it is done.
export function ReplaceWithCommonsDialog({
  site,
  target,
  onCancel,
  onReplaced,
  finalFocus,
}: ReplaceWithCommonsDialogProps) {
  const { toast } = useToast();
  const [isReplacing, setIsReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replace = async () => {
    if (!target) return;
    setError(null);
    setIsReplacing(true);
    try {
      const record = await diveSitesAPI.replaceDiveSite(site.uuid, target.uuid);
      toast({ title: `Replaced with ${record.name}.` });
      onReplaced(record);
    } catch (failure) {
      setError(
        getApiErrorMessage(
          failure,
          "Failed to replace the site. Please try again.",
        ),
      );
    } finally {
      setIsReplacing(false);
    }
  };

  // The target goes in the commit that closes the dialog, which is still fading.
  const recordName = target?.name ?? "the Commons site";

  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (open) return;
        setError(null);
        onCancel();
      }}
      title="Replace with Commons site"
      description={`Your dives at ${site.name} will name ${recordName} instead, and your notes and tags move to it. ${site.name} is then deleted, with any proposal on it, and a dive draft naming it names ${recordName} instead.`}
      confirmText="Replace with Commons site"
      isLoading={isReplacing}
      finalFocus={finalFocus}
      onConfirm={replace}
    >
      <FormApiError error={error} />
    </ConfirmDialog>
  );
}
