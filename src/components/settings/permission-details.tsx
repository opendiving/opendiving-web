"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown, Minus, ShieldCheck } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { groupPermissions } from "@/lib/permissions";

export function PermissionDetails({
  scopes,
  name,
  children,
}: {
  scopes: string[];
  name: string;
  children?: ReactNode;
}) {
  const groups = groupPermissions(scopes);
  const actions = new Map<string, { label: string; order: number }>();
  for (const group of groups) {
    for (const permission of group.permissions) {
      actions.set(permission.action, permission);
    }
  }
  const columns = [...actions].sort((a, b) => a[1].order - b[1].order);

  return (
    <details className="group border-t">
      <summary className="flex cursor-pointer list-none items-center gap-2 bg-muted/20 px-5 py-3.5 text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <ShieldCheck
          className="h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        Permissions
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
          {scopes.length}
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
            <caption className="sr-only">Permissions granted to {name}</caption>
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
        {children}
      </div>
    </details>
  );
}
