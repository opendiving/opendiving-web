"use client";

import { CopyField } from "@/components/ui/copy-field";

/**
 * A link's address, read-only and selected on focus, with a Copy button that
 * reports in a toast. `label` names the field; `what` names the link in the log.
 */
export function LinkAddressField({
  url,
  label,
  what,
}: {
  url: string;
  label: string;
  what: string;
}) {
  return (
    <CopyField
      value={url}
      label={label}
      what={what}
      copied="Link copied"
      selectHint="Select the address and copy it from there."
    />
  );
}
