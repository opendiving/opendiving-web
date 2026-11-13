"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Minus,
  Plug,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { McpConnection } from "@/lib/api/mcp";
import { formatDateTime } from "@/lib/date-time";
import { groupMcpPermissions } from "@/lib/mcp-permissions";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface McpConnectionCardProps {
  connection: McpConnection;
  onRevoke: () => void;
}

export function McpConnectionCard({
  connection,
  onRevoke,
}: McpConnectionCardProps) {
  const groups = groupMcpPermissions(connection.scopes);
  const actions = new Map<string, { label: string; order: number }>();
  for (const group of groups) {
    for (const permission of group.permissions) {
      actions.set(permission.action, permission);
    }
  }
  const columns = [...actions].sort((a, b) => a[1].order - b[1].order);

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
      <details className="group border-t">
        <summary className="flex cursor-pointer list-none items-center gap-2 bg-muted/20 px-5 py-3.5 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <ShieldCheck
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          Permissions
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
            {connection.scopes.length}
          </span>
          <ChevronDown
            className="ml-auto h-4 w-4 text-muted-foreground group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="space-y-4 p-5">
          <ScrollArea
            className="rounded-lg border"
            viewportClassName="max-h-[26rem]"
          >
            <table className="w-full min-w-[30rem] text-sm">
              <caption className="sr-only">
                Permissions granted to {connection.name}
              </caption>
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium">
                    Content
                  </th>
                  {columns.map(([action, permission]) => (
                    <th
                      key={action}
                      scope="col"
                      className="px-3 py-3 text-center text-xs font-medium whitespace-nowrap"
                    >
                      {permission.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {groups.map((group) => (
                  <tr key={group.resource} className="hover:bg-muted/20">
                    <th
                      scope="row"
                      className="px-4 py-3 text-left font-normal whitespace-nowrap"
                    >
                      {group.label}
                    </th>
                    {columns.map(([action]) => {
                      const allowed = group.permissions.some(
                        (permission) => permission.action === action,
                      );
                      return (
                        <td key={action} className="px-3 py-3 text-center">
                          {allowed ? (
                            <Check
                              className="mx-auto h-4 w-4 text-teal"
                              aria-hidden="true"
                            />
                          ) : (
                            <Minus
                              className="mx-auto h-3.5 w-3.5 text-muted-foreground/40"
                              aria-hidden="true"
                            />
                          )}
                          <span className="sr-only">
                            {allowed ? "Allowed" : "Not granted"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          <p className="break-all text-xs text-muted-foreground">
            Application ID: {connection.client_id}
          </p>
        </div>
      </details>
    </article>
  );
}
