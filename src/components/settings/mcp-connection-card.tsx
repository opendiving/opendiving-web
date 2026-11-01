"use client";

import { CalendarDays, Clock3, Plug, Trash2 } from "lucide-react";
import type { McpConnection } from "@/lib/api/mcp";
import { formatDateTime } from "@/lib/date-time";
import { groupPermissions } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { PermissionDetails } from "./permission-details";

interface McpConnectionCardProps {
  connection: McpConnection;
  onRevoke: () => void;
}

export function McpConnectionCard({
  connection,
  onRevoke,
}: McpConnectionCardProps) {
  const groups = groupPermissions(connection.scopes);

  return (
    <article
      aria-label={`${connection.name} connection`}
      className="min-w-0 overflow-hidden rounded-xl border"
    >
      <div className="space-y-5 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-teal/15 bg-teal/5 text-teal">
            <Plug className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-base font-semibold">
              {connection.name}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {connection.scopes.length} permissions across {groups.length}{" "}
              categories
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-2"
            aria-label={`Revoke access for ${connection.name}`}
            onClick={onRevoke}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Revoke
          </Button>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Connected
            </dt>
            <dd className="text-sm">
              <time dateTime={connection.created_at}>
                {formatDateTime(connection.created_at)}
              </time>
            </dd>
          </div>
          <div className="space-y-1.5">
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              Last used
            </dt>
            <dd className="text-sm">
              {connection.last_used_at ? (
                <time dateTime={connection.last_used_at}>
                  {formatDateTime(connection.last_used_at)}
                </time>
              ) : (
                <span className="text-muted-foreground">
                  No activity recorded
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>
      <PermissionDetails scopes={connection.scopes} name={connection.name}>
        <p className="break-all text-xs text-muted-foreground">
          Application ID: {connection.client_id}
        </p>
      </PermissionDetails>
    </article>
  );
}
