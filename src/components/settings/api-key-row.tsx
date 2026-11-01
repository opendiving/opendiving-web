"use client";

import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { IconTooltip } from "@/components/ui/tooltip";
import { CopyField } from "@/components/ui/copy-field";
import type { ApiKey } from "@/lib/api/api-keys";
import { formatDateTime } from "@/lib/date-time";
import { PermissionDetails } from "./permission-details";

const DAY = { year: "numeric", month: "short", day: "numeric" } as const;
const SCOPE_LABELS = {
  read: "Read only",
  write: "Read and write",
  scoped: "Custom permissions",
};

export function ApiKeyRow({
  apiKey,
  now,
  secret,
  onDone,
  isDeleting,
  onRevoke,
}: {
  apiKey: ApiKey;
  now: number;
  secret: string | null;
  onDone: () => void;
  isDeleting: boolean;
  onRevoke: () => void;
}) {
  const expired =
    apiKey.expires_at !== null && new Date(apiKey.expires_at).getTime() <= now;

  return (
    <div className="space-y-3 overflow-hidden rounded-lg border p-3">
      {/* No `flex-wrap` here: wrapped, the button drops onto a line of its own
          at the left. The text block takes the room and wraps inside it. */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium break-words">{apiKey.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {apiKey.prefix}&hellip;
            </span>
            <Badge variant="outline">{SCOPE_LABELS[apiKey.scope]}</Badge>
            {expired && <Badge variant="destructive">Expired</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Created {formatDateTime(apiKey.created_at, DAY)} ·{" "}
            {apiKey.last_used_at
              ? `Last used ${formatDateTime(apiKey.last_used_at, DAY)}`
              : "Never used"}{" "}
            ·{" "}
            {apiKey.expires_at
              ? `${expired ? "Expired" : "Expires"} ${formatDateTime(apiKey.expires_at, DAY)}`
              : "No expiry"}
          </p>
        </div>
        <IconTooltip label={`Revoke ${apiKey.name}`}>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            disabled={isDeleting}
            onClick={onRevoke}
          >
            {isDeleting ? <ButtonSpinner /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </IconTooltip>
      </div>

      {apiKey.scope === "scoped" ? (
        <PermissionDetails scopes={apiKey.scopes} name={apiKey.name} />
      ) : (
        <p className="text-xs text-muted-foreground">
          This key uses legacy access. Create a new key to choose individual
          permissions.
        </p>
      )}

      {secret && (
        <div className="space-y-3 border-t pt-3">
          <CopyField
            value={secret}
            label="New API key"
            what="API key"
            copied="API key copied"
            selectHint="Select the key and copy it from there."
            mono
          />
          <p className="text-sm text-muted-foreground">
            Copy it now: it can&apos;t be shown again, because only a
            fingerprint of it is kept. Send it as{" "}
            <code className="font-mono text-xs">
              Authorization: Bearer &lt;key&gt;
            </code>
            .
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
